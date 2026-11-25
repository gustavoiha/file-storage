export const meta = {
  name: 'agent-team',
  description: 'Long-running product team: watches GitHub issues by gustavoiha; PM triages, Delivery Orchestrator plans sprints; per task design → engineering → code + security review → review judge; per sprint integrate → one dev deploy → parallel testers → filter → fix loop → merge → prod deploy',
  whenToUse: 'Start or restart the autonomous agent team for gustavoiha/file-storage. State lives in the agent-memory branch, so a relaunch resumes where it stopped.',
  phases: [
    { title: 'Watch', detail: 'poll GitHub for new issues/comments by gustavoiha' },
    { title: 'PM', detail: 'product manager: requests → tasks, triage (ready / backlog / reject), product memory' },
    { title: 'Delivery', detail: 'delivery orchestrator: sprints, milestones, hand-offs, sprint fixes, escalation' },
    { title: 'Tasks', detail: 'per-task pipelines: design, engineering, code + security review, review judge' },
    { title: 'Sprint', detail: 'integrate the sprint branch, one dev deploy, parallel testers, filter, prod deploy' },
  ],
}

// ================================================================ CONFIG (edit here)
// Product triage criteria are NOT in this file: the PM reads them at every run from
//   .claude/agent-team/triage-criteria.md   (edit that file; no relaunch needed)
// The values below are read once at launch (relaunch after editing). Any of them can also be passed in `args`.
const A = args || {}
const CONFIG = {
  maxAgents: A.maxAgents || 900,              // hard cap per run is 1000; stop early and ask for a relaunch
  maxFixLoops: A.maxFixLoops || 3,            // the Nth time a sprint test finds bugs, the orchestrator stops and asks the human
  sprintMaxTasks: A.sprintMaxTasks || 5,      // most tasks the orchestrator puts in one sprint (sprint-fix tasks not counted)
  maxParallelTesters: A.maxParallelTesters || 4, // tester agents running at once against the single sprint deploy
  maxTaskHops: A.maxTaskHops || 20,           // stage hops per task pipeline before handing back to the orchestrator
  maxDispatchFailures: A.maxDispatchFailures || 3, // a task whose pipeline fails this many times in a row is left alone (logged)
  pollsPerWatch: A.pollsPerWatch || 25,       // each poll blocks up to 100 s (stays under the 2-minute foreground limit)
}

// The local checkout path comes from the launcher (args.repo), so no machine-specific path is committed here.
if (typeof A.repo !== 'string' || !A.repo.startsWith('/')) throw new Error('Pass args.repo: the absolute path of the repo checkout (git rev-parse --show-toplevel).')
const REPO = A.repo.replace(/\/+$/, '')
const SKILL = `${REPO}/.claude/skills/agent-team`
const MEM = `${REPO}/.agent-team`
const CRITERIA = `${REPO}/.claude/agent-team/triage-criteria.md`

let agentsUsed = 0
// agent() can THROW (e.g. a subagent that never calls StructuredOutput). One bad agent must not kill the team:
// turn every failure into null, which callers treat as "failed, the orchestrator re-dispatches".
const call = async (prompt, opts) => {
  agentsUsed++
  try { return await agent(prompt, opts) }
  catch (e) { log(`${(opts && opts.label) || 'agent'} failed: ${String(e && e.message || e).slice(0, 200)}`); return null }
}

// ================================================================ schemas
const EVENTS = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string' }, id: { type: 'string' }, issue: { type: 'integer' },
          title: { type: 'string' }, body: { type: 'string' }, url: { type: 'string' }, at: { type: 'string' },
        },
        required: ['kind', 'id', 'issue', 'body'],
      },
    },
  },
  required: ['events'],
}

const PM_RESULT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    readyTasks: { type: 'array', items: { type: 'string', pattern: '^T-\\d{4}$' } },  // marked ready in this run
    wakeOrchestrator: { type: 'boolean' },  // true when a human answer, cancellation or sprint comment needs delivery work
  },
  required: ['summary', 'readyTasks', 'wakeOrchestrator'],
}

const TASK_STAGES = ['design', 'design-decision', 'engineering', 'review', 'judging']
const ORCH_RESULT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    // the open sprint after this run (omit when none): lets the workflow start the sprint test by itself
    activeSprint: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^S-\\d{3}$' },
        status: { type: 'string' },
        tasks: { type: 'array', items: { type: 'string', pattern: '^T-\\d{4}$' } },
      },
      required: ['id', 'status', 'tasks'],
    },
    dispatches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          taskId: { type: 'string', pattern: '^T-\\d{4}$' },
          stage: { type: 'string', enum: TASK_STAGES },
          instructions: { type: 'string' },
        },
        required: ['taskId', 'stage', 'instructions'],
      },
    },
    // resume or start a sprint-level stage (omit when none; only one sprint pipeline runs at a time)
    sprintAction: {
      type: 'object',
      properties: {
        sprintId: { type: 'string', pattern: '^S-\\d{3}$' },
        action: { type: 'string', enum: ['test', 'filter', 'deploy'] },
        instructions: { type: 'string' },
      },
      required: ['sprintId', 'action', 'instructions'],
    },
  },
  required: ['summary', 'dispatches'],
}

const TASK_OUTCOMES = ['awaiting-human', 'designed', 'pr-ready', 'rebased', 'reviewed', 'approved', 'changes-requested',
  'needs-review', 'failed']
const TASK_RESULT = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: TASK_OUTCOMES },
    summary: { type: 'string' },
    newTasks: { type: 'integer' },  // backlog candidates written for the PM to triage
  },
  required: ['outcome', 'summary'],
}

const SPRINT_DEPLOY_RESULT = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: ['deployed', 'needs-rebase', 'awaiting-human', 'failed'] },
    summary: { type: 'string' },
    round: { type: 'integer' },
    testTargets: { type: 'array', items: { type: 'string', pattern: '^T-\\d{4}$' } },   // tasks to test this round
    rebaseTasks: { type: 'array', items: { type: 'string', pattern: '^T-\\d{4}$' } },   // PRs that conflict with the sprint branch
  },
  required: ['outcome', 'summary'],
}

const TESTER_RESULT = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: ['tested', 'failed'] },
    summary: { type: 'string' },
    findings: { type: 'integer' },
  },
  required: ['outcome', 'summary'],
}

const FILTER_RESULT = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: ['pass', 'bugs-found', 'awaiting-human', 'failed'] },
    summary: { type: 'string' },
    newTasks: { type: 'integer' },
  },
  required: ['outcome', 'summary'],
}

const SPRINT_FIX_RESULT = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: ['fix-dispatched', 'awaiting-human', 'pass', 'failed'] },
    summary: { type: 'string' },
    fixTaskId: { type: 'string', pattern: '^T-\\d{4}$' },
    fixLoop: { type: 'integer' },  // value of the sprint's `Fix loops:` counter after this run
  },
  required: ['outcome', 'summary'],
}

const DEPLOY_RESULT = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: ['done', 'retest', 'needs-engineering', 'awaiting-human', 'failed'] },
    summary: { type: 'string' },
  },
  required: ['outcome', 'summary'],
}

// ================================================================ roles
// agentType = custom agent .claude/agents/agent-team-<role>.md; its name is how the permission gate
// (.claude/agent-team/permissions.json) knows which role is running a command.
const ROLES = {
  'design':          { file: 'design',        name: 'Design agent',            mode: 'design',          agentType: 'agent-team-design' },
  'design-decision': { file: 'design',        name: 'Design agent',            mode: 'design-decision', agentType: 'agent-team-design' },
  'engineering':     { file: 'engineering',   name: 'Engineering agent',                                agentType: 'agent-team-engineering' },
  // review = code review and security review of the same PR, run in parallel; both only report findings.
  'review':          { parallel: [
                       { key: 'code-review',     file: 'code-reviewer',     name: 'Code reviewer agent',     agentType: 'agent-team-code-reviewer' },
                       { key: 'security-review', file: 'security-reviewer', name: 'Security reviewer agent', agentType: 'agent-team-security-reviewer' },
                     ] },
  // judging = the review judge weighs both sets of findings (or, after a rebase-only change, checks the range-diff).
  'judging':         { file: 'review-judge',  name: 'Review judge agent',                               agentType: 'agent-team-review-judge' },
}
const ORCH = { file: 'delivery-orchestrator', name: 'Delivery Orchestrator agent', agentType: 'agent-team-delivery-orchestrator' }
const TESTING = { file: 'testing', name: 'Testing agent', agentType: 'agent-team-testing' }
const FILTER = { file: 'test-filter', name: 'Test results filtering agent', agentType: 'agent-team-test-filter' }
const DEPLOY = { file: 'deployment', name: 'Deployment agent', agentType: 'agent-team-deployment' }

// task outcome -> next task stage (undefined = the task pipeline stops; the workflow decides what is next)
const NEXT = {
  'pr-ready': 'review',
  'reviewed': 'judging',
  'changes-requested': 'engineering',
  'rebased': 'judging',       // rebase-only change → the judge checks the range-diff instead of a full review
  'needs-review': 'review',   // the judge found more than a rebase in a rebase-only change
}

function header(r) {
  return [
    `You are the ${r.name} of an autonomous product team.`,
    `REPO = ${REPO}. First read ${SKILL}/roles/_shared.md, then ${SKILL}/roles/${r.file}.md, and follow them exactly.`,
  ]
}
function taskPrompt(r, taskId, instructions, mode) {
  return [
    ...header(r),
    `Task: ${taskId} (task file: ${MEM}/tasks/${taskId}.md). Comment only on this task's own issue (its \`Issue:\` line).`,
    (mode || r.mode) ? `Mode: \`${mode || r.mode}\`.` : '',
    `Why you were called: ${instructions}`,
    `Return the outcome your role file specifies and a 1-3 sentence summary.`,
  ].filter(Boolean).join('\n')
}
function sprintPrompt(r, sprintId, mode, instructions, extra) {
  return [
    ...header(r),
    `Sprint: ${sprintId} (sprint file: ${MEM}/sprints/${sprintId}.md, branch \`sprint/${sprintId}\`). Comment only on the sprint's issue (its \`Issue:\` line) or the issues of its tasks, as your role file says.`,
    `Mode: \`${mode}\`.`,
    extra || '',
    `Why you were called: ${instructions}`,
    `Return the outcome your role file specifies and a 1-3 sentence summary.`,
  ].filter(Boolean).join('\n')
}

// ================================================================ wake-ups
let pmNeeded = true      // first PM run sweeps triage and events (resume after restart)
let orchNeeded = true    // first orchestrator run sweeps the board and the open sprint (resume after restart)
const orchNotes = []     // what happened since the orchestrator last ran
let wake = null
let wakeP = new Promise(r => { wake = r })
function ping(kind) { const w = wake; wakeP = new Promise(r => { wake = r }); w(kind) }
function wakePm(why) { pmNeeded = true; ping('pm') }
// Every pipeline end that needs a delivery decision wakes the orchestrator. Nothing waits on a PM sweep any more.
function wakeOrch(note) { if (note) orchNotes.push(note); orchNeeded = true; ping('orch') }

// ================================================================ sprint state seen by the script
// activeSprint comes from the orchestrator (memory is the source of truth); the script only uses it to start the
// sprint test as soon as every sprint task is approved, without another orchestrator run.
let activeSprint = null            // { id, status, tasks: [] }
const approved = new Set()         // task ids whose latest pipeline ended "approved"
const runningTasks = new Map()     // taskId -> promise
let sprintRun = null               // { id, promise } of the running sprint pipeline
const failures = {}                // taskId -> consecutive failed pipelines

// The workflow starts a sprint test by itself only while the sprint is being built or fixed. Any other status
// (testing, deploying, awaiting-human after an escalation, blocked after a failure) waits for the orchestrator.
const AUTO_TEST_STATUSES = ['building', 'fixing']
function setSprintStatus(id, status) { if (activeSprint && activeSprint.id === id) activeSprint.status = status }
function sprintReady() {
  return activeSprint && AUTO_TEST_STATUSES.includes(activeSprint.status) && activeSprint.tasks.length > 0 && !sprintRun &&
    activeSprint.tasks.every(t => approved.has(t) && !runningTasks.has(t))
}
function maybeStartSprintTest(reason) {
  if (!sprintReady()) return false
  startSprint(activeSprint.id, 'test', `Every task of the sprint is approved (${reason}). Integrate the approved PRs into the sprint branch, deploy it to dev once, and set up the next test round.`)
  return true
}

// ================================================================ task pipeline
async function runTask(taskId, stage, instructions) {
  approved.delete(taskId)
  let mode = null
  for (let step = 0; step < CONFIG.maxTaskHops; step++) {
    if (agentsUsed >= CONFIG.maxAgents) { log(`${taskId}: agent budget reached, pausing at ${stage}`); return { taskId, outcome: 'paused' } }
    const r = ROLES[stage]
    const one = (role, label) => call(taskPrompt(role, taskId, instructions, role === r ? mode : null), {
      label, phase: 'Tasks', schema: TASK_RESULT, agentType: role.agentType,
    })
    let res
    if (r.parallel) {
      const parts = await Promise.all(r.parallel.map(p => one(p, `${taskId} ${p.key}`).then(res => ({ key: p.key, res }))))
      parts.filter(p => p.res).forEach(p => log(`${taskId} ${p.key} → ${p.res.outcome}`))
      // both reviewers must finish (outcome "reviewed") before the judge runs
      res = parts.some(p => !p.res) ? null : {
        outcome: parts.every(p => p.res.outcome === 'reviewed') ? 'reviewed' : 'failed',
        summary: parts.map(p => `${p.key}: ${p.res.outcome} - ${p.res.summary}`).join(' | '),
      }
    } else {
      res = await one(r, `${taskId} ${stage}${mode ? ' (' + mode + ')' : ''}`)
    }
    if (!res) { log(`${taskId}: ${stage} agent failed`); return { taskId, outcome: 'failed', stage } }
    log(`${taskId} ${stage} → ${res.outcome}: ${res.summary}`)
    if ((res.newTasks || 0) > 0) wakePm(`${taskId} ${stage} wrote ${res.newTasks} backlog candidate(s)`)
    const next = NEXT[res.outcome]
    if (!next) return { taskId, outcome: res.outcome, stage, summary: res.summary }
    mode = res.outcome === 'rebased' ? 'rebase-check' : null
    instructions = `Previous stage (${stage}) finished with "${res.outcome}": ${res.summary}`
    stage = next
  }
  log(`${taskId}: hit ${CONFIG.maxTaskHops} stage hops; handing back to the orchestrator`)
  return { taskId, outcome: 'hop-limit', stage }
}

function startTask(taskId, stage, instructions) {
  if (runningTasks.has(taskId)) return
  if ((failures[taskId] || 0) >= CONFIG.maxDispatchFailures) {
    log(`${taskId}: skipped, its pipeline failed ${failures[taskId]} times in a row. Check the task file and relaunch.`)
    return
  }
  const p = runTask(taskId, stage, instructions).then(res => {
    runningTasks.delete(taskId)
    failures[taskId] = res.outcome === 'failed' ? (failures[taskId] || 0) + 1 : 0
    if (res.outcome === 'approved') {
      approved.add(taskId)
      // deterministic hand-off: last approved task of the sprint starts the sprint test; otherwise nothing to decide
      if (!maybeStartSprintTest(`${taskId} approved`) && !(activeSprint && activeSprint.tasks.includes(taskId))) {
        wakeOrch(`${taskId} approved but is not in the open sprint`)
      }
    } else if (res.outcome !== 'paused') {
      wakeOrch(`${taskId} pipeline stopped at ${res.stage} with "${res.outcome}"${res.summary ? ': ' + res.summary : ''}`)
    }
    return res
  })
  runningTasks.set(taskId, p)
}

// ================================================================ sprint pipeline
// test: integrate + one dev deploy → parallel testers → filter → (bugs → orchestrator groups one fix task | pass → deploy)
async function runSprint(sprintId, action, instructions) {
  let round = null
  if (action === 'test') {
    const dep = await call(sprintPrompt(TESTING, sprintId, 'sprint-deploy', instructions),
      { label: `${sprintId} integrate + dev deploy`, phase: 'Sprint', schema: SPRINT_DEPLOY_RESULT, agentType: TESTING.agentType })
    if (!dep) return { outcome: 'failed', stage: 'sprint-deploy' }
    log(`${sprintId} sprint-deploy → ${dep.outcome}: ${dep.summary}`)
    if (dep.outcome === 'needs-rebase') {
      // rebase-only engineering runs go through the judge's range-diff check, then the last approval restarts the test
      for (const t of dep.rebaseTasks || []) startTask(t, 'engineering',
        `Your approved PR conflicts with sprint/${sprintId} after other sprint PRs were integrated. Rebase it on origin/sprint/${sprintId}, resolve the conflicts, re-run the checks, and return "rebased" if the rebase was the only change.`)
      setSprintStatus(sprintId, 'building')
      return { outcome: 'needs-rebase', stage: 'sprint-deploy', quiet: (dep.rebaseTasks || []).length > 0 }
    }
    if (dep.outcome !== 'deployed') return { outcome: dep.outcome, stage: 'sprint-deploy', summary: dep.summary }
    round = dep.round || null
    const targets = [...new Set(dep.testTargets || [])]
    // parallel testers against the single deploy: one per task, plus one regression tester for the whole sprint
    const jobs = [...targets.map(t => ({ target: t, label: `${sprintId} test ${t}` })), { target: 'regression', label: `${sprintId} test regression` }]
    let next = 0
    const worker = async () => {
      const out = []
      while (next < jobs.length) {
        const j = jobs[next++]
        const res = await call(sprintPrompt(TESTING, sprintId, 'sprint-test',
          `Test round ${round || '(see the sprint file)'} is deployed to dev. Test target: ${j.target === 'regression' ? 'regression (the whole sprint build)' : `task ${j.target} (task file: ${MEM}/tasks/${j.target}.md)`}. Do not deploy.`,
          `Test target: \`${j.target}\`.`),
          { label: j.label, phase: 'Sprint', schema: TESTER_RESULT, agentType: TESTING.agentType })
        log(`${j.label} → ${res ? res.outcome + ': ' + res.summary : 'agent failed'}`)
        out.push({ target: j.target, res })
      }
      return out
    }
    const results = (await Promise.all(Array.from({ length: Math.min(CONFIG.maxParallelTesters, jobs.length) }, worker))).flat()
    const missing = results.filter(r => !r.res || r.res.outcome !== 'tested').map(r => r.target)
    if (missing.length) return { outcome: 'failed', stage: 'sprint-test', summary: `no test report for: ${missing.join(', ')}` }
    action = 'filter'
    instructions = `Test round ${round || ''} finished: every tester wrote its report (${targets.join(', ')}, regression).`
  }

  if (action === 'filter') {
    const filt = await call(sprintPrompt(FILTER, sprintId, 'sprint-filter', instructions),
      { label: `${sprintId} filter`, phase: 'Sprint', schema: FILTER_RESULT, agentType: FILTER.agentType })
    if (!filt) return { outcome: 'failed', stage: 'sprint-filter' }
    log(`${sprintId} filter → ${filt.outcome}: ${filt.summary}`)
    if ((filt.newTasks || 0) > 0) wakePm(`${sprintId} filter wrote ${filt.newTasks} backlog candidate(s)`)
    if (filt.outcome === 'bugs-found') {
      // the orchestrator groups every bug of the round into ONE sprint-fix task, or escalates at the loop limit
      const fix = await call(sprintPrompt(ORCH, sprintId, 'sprint-fix',
        `The sprint filter found bugs that must be fixed in this sprint: ${filt.summary}`,
        `Fix-loop limit: ${CONFIG.maxFixLoops} (when the sprint's \`Fix loops:\` counter would reach it, escalate instead of creating the fix task).`),
        { label: `${sprintId} sprint-fix`, phase: 'Delivery', schema: SPRINT_FIX_RESULT, agentType: ORCH.agentType })
      if (!fix) return { outcome: 'failed', stage: 'sprint-fix' }
      log(`${sprintId} sprint-fix → ${fix.outcome}: ${fix.summary}`)
      if (fix.outcome === 'fix-dispatched' && fix.fixTaskId) {
        if ((fix.fixLoop || 0) >= CONFIG.maxFixLoops) {
          log(`${sprintId}: fix loop ${fix.fixLoop} reached the limit (${CONFIG.maxFixLoops}) but no escalation was made; not starting ${fix.fixTaskId}`)
          return { outcome: 'loop-limit', stage: 'sprint-fix', summary: `fix loop ${fix.fixLoop} of ${CONFIG.maxFixLoops}: escalate to the human before ${fix.fixTaskId} starts` }
        }
        if (activeSprint && activeSprint.id === sprintId && !activeSprint.tasks.includes(fix.fixTaskId)) activeSprint.tasks.push(fix.fixTaskId)
        setSprintStatus(sprintId, 'fixing')
        startTask(fix.fixTaskId, 'engineering', `Sprint ${sprintId} fix loop ${fix.fixLoop}: fix every bug listed in the task file, on a PR against sprint/${sprintId}.`)
        return { outcome: 'fixing', stage: 'sprint-fix', quiet: true }
      }
      if (fix.outcome !== 'pass') return { outcome: fix.outcome, stage: 'sprint-fix', summary: fix.summary }
      instructions = `The orchestrator kept no bug for this sprint: ${fix.summary}`
    } else if (filt.outcome !== 'pass') {
      return { outcome: filt.outcome, stage: 'sprint-filter', summary: filt.summary }
    } else {
      instructions = `Test round passed: ${filt.summary}`
    }
    action = 'deploy'
  }

  if (action === 'deploy') {
    const dep = await call(sprintPrompt(DEPLOY, sprintId, 'sprint-deploy', instructions),
      { label: `${sprintId} prod deploy`, phase: 'Sprint', schema: DEPLOY_RESULT, agentType: DEPLOY.agentType })
    if (!dep) return { outcome: 'failed', stage: 'deploy' }
    log(`${sprintId} deploy → ${dep.outcome}: ${dep.summary}`)
    if (dep.outcome === 'retest') return runSprint(sprintId, 'test', `Deployment rebased the sprint branch on a newer main: ${dep.summary} Run a new test round (this is not a fix loop).`)
    return { outcome: dep.outcome, stage: 'deploy', summary: dep.summary }
  }
  return { outcome: 'failed', stage: action }
}

function startSprint(sprintId, action, instructions) {
  if (sprintRun) return
  setSprintStatus(sprintId, action === 'deploy' ? 'deploying' : 'testing')
  const promise = runSprint(sprintId, action, instructions).then(res => {
    sprintRun = null
    // anything but a hand-off the workflow follows by itself leaves the sprint to the orchestrator
    if (!['needs-rebase', 'fixing', 'done'].includes(res.outcome)) setSprintStatus(sprintId, res.outcome === 'awaiting-human' ? 'awaiting-human' : 'blocked')
    if (res.outcome === 'done') {
      if (activeSprint && activeSprint.id === sprintId) activeSprint = null
      for (const t of [...approved]) approved.delete(t)
      wakePm(`${sprintId} shipped`)  // PM updates product memory and closes requests whose asks are delivered
    }
    if (!res.quiet) wakeOrch(`${sprintId} sprint pipeline stopped at ${res.stage} with "${res.outcome}"${res.summary ? ': ' + res.summary : ''}`)
    return res
  })
  sprintRun = { id: sprintId, promise }
}

// ================================================================ main loop
const watchPrompt = [
  `Watch GitHub for new instructions from the human. Run this command with the Bash tool, in the FOREGROUND`,
  `(timeout 150000 ms; never run_in_background, never Monitor, never sleep):`,
  `  ${SKILL}/scripts/poll-github.sh 100`,
  `It blocks up to 100 seconds and prints a JSON array of unhandled issues/comments by gustavoiha (or [] on timeout).`,
  `Run it again, up to ${CONFIG.pollsPerWatch} times in total, while it prints []. As soon as it prints a non-empty array, stop`,
  `and return those items as \`events\` exactly as printed (kind, id, issue, title, body, url, at).`,
  `If every run printed [] (or failed), return {"events": []}. Polling is read-only and safe to repeat: an event you miss is`,
  `delivered again next time, so ALWAYS finish by calling StructuredOutput rather than waiting.`,
  `Do nothing else: do not act on the events, do not run other commands.`,
].join('\n')

let pendingEvents = []
let watchP = null
let watchFailures = 0
const ticks = []

while (agentsUsed < CONFIG.maxAgents) {
  if (pmNeeded || pendingEvents.length) {
    const events = pendingEvents
    pendingEvents = []
    pmNeeded = false
    const pm = await call([
      `You are the Product Manager agent of an autonomous product team.`,
      `REPO = ${REPO}. First read ${SKILL}/roles/_shared.md, then ${SKILL}/roles/product-manager.md, and follow them exactly.`,
      `Triage criteria (read them every run; the human edits this file): ${CRITERIA}`,
      `New GitHub events from the human (oldest first):`,
      events.length ? JSON.stringify(events, null, 2) : '(none - this is a triage sweep)',
    ].join('\n'), { label: `PM (${events.length} events)`, phase: 'PM', schema: PM_RESULT, agentType: 'agent-team-pm' })
    if (!pm) {
      // events were not acked, so the poller delivers them again; just make sure the PM runs again soon
      log('PM agent failed; its events stay unacknowledged and will be redelivered')
      if (!events.length) pmNeeded = true
    } else {
      log(`PM: ${pm.summary}`)
      ticks.push({ pm: events.length, ready: pm.readyTasks })
      if (pm.readyTasks.length || pm.wakeOrchestrator) wakeOrch(`PM: ${pm.summary}`)
    }
  }

  if (orchNeeded) {
    orchNeeded = false
    const notes = orchNotes.splice(0)
    const plan = await call([
      ...header(ORCH),
      `Mode: \`plan\`.`,
      `Limits: at most ${CONFIG.sprintMaxTasks} tasks per sprint (sprint-fix tasks not counted); fix-loop limit ${CONFIG.maxFixLoops}.`,
      `What happened since your last run:`,
      notes.length ? notes.map(n => `- ${n}`).join('\n') : '- (nothing recorded - this is a sweep after a (re)launch)',
      `Task pipelines running right now (do not dispatch these): ${[...runningTasks.keys()].join(', ') || 'none'}.`,
      `Sprint pipeline running right now (do not start a sprint action): ${sprintRun ? sprintRun.id : 'none'}.`,
      `Tasks this run has seen approved: ${[...approved].join(', ') || 'none'}.`,
    ].join('\n'), { label: 'Orchestrator', phase: 'Delivery', schema: ORCH_RESULT, agentType: ORCH.agentType })
    if (!plan) {
      log('Orchestrator agent failed; it runs again at the next wake-up')
      orchNotes.unshift(...notes)
    } else {
      log(`Orchestrator: ${plan.summary}`)
      activeSprint = plan.activeSprint ? { ...plan.activeSprint, tasks: [...plan.activeSprint.tasks] } : null
      ticks.push({ orch: plan.dispatches.map(d => `${d.taskId}:${d.stage}`), sprint: plan.sprintAction && `${plan.sprintAction.sprintId}:${plan.sprintAction.action}` })
      for (const d of plan.dispatches) startTask(d.taskId, d.stage, d.instructions)
      if (plan.sprintAction) startSprint(plan.sprintAction.sprintId, plan.sprintAction.action, plan.sprintAction.instructions)
      else maybeStartSprintTest('orchestrator sweep')
    }
  }

  if (!watchP) {
    watchP = call(watchPrompt, { label: 'watch GitHub', phase: 'Watch', schema: EVENTS, model: 'haiku', effort: 'low', agentType: 'agent-team-watcher' })
      .then(r => ({ kind: 'events', ok: !!r, events: (r && r.events) || [] }))
  }
  if (pmNeeded || orchNeeded) continue
  const winner = await Promise.race([watchP, wakeP.then(k => ({ kind: k }))])
  if (winner.kind === 'events') {
    watchP = null
    watchFailures = winner.ok ? 0 : watchFailures + 1
    if (watchFailures >= 3) { log('GitHub watcher failed 3 times in a row; stopping. Check `gh auth status` and relaunch.'); break }
    if (winner.events.length) {
      log(`${winner.events.length} new GitHub event(s): ${winner.events.map(e => `#${e.issue} ${e.kind}`).join(', ')}`)
      pendingEvents.push(...winner.events)
    }
  }
}

log(`Stopping: used ${agentsUsed} agents (limit ${CONFIG.maxAgents}). Waiting for running pipelines, then relaunch the agent-team workflow.`)
const finished = await Promise.all([...runningTasks.values(), ...(sprintRun ? [sprintRun.promise] : [])])
// unprocessed events were never acked, so the next run's watcher picks them up again
return { agentsUsed, ticks, finished }
