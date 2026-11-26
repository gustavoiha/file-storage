export const meta = {
  name: 'agent-team',
  description: 'Long-running product team: watches GitHub issues by gustavoiha; the PM triages and groups tasks, the Delivery Orchestrator dispatches ready tasks through design → engineering → code + security review → review judge → testing (one deploy, parallel testers) → filtering → deployment',
  whenToUse: 'Start or restart the autonomous agent team for gustavoiha/file-storage. State lives in the agent-memory branch, so a relaunch resumes where it stopped.',
  phases: [
    { title: 'Watch', detail: 'poll GitHub for new issues/comments by gustavoiha' },
    { title: 'PM', detail: 'product manager: requests, triage, grouping, roadmap; marks tasks ready' },
    { title: 'Delivery', detail: 'delivery orchestrator: dispatches ready tasks, resumes pipelines, tracks milestones' },
    { title: 'Tasks', detail: 'per-task pipelines: design, engineering, review, testing, filtering, deployment' },
  ],
}

// ---------------------------------------------------------------- config
// The local checkout path comes from the launcher (args.repo), so no machine-specific path is committed here.
const A = args || {}
if (typeof A.repo !== 'string' || !A.repo.startsWith('/')) throw new Error('Pass args.repo: the absolute path of the repo checkout (git rev-parse --show-toplevel).')
const REPO = A.repo.replace(/\/+$/, '')
const SKILL = `${REPO}/.claude/skills/agent-team`
const MEM = `${REPO}/.agent-team`
const MAX_AGENTS = A.maxAgents || 900               // hard cap per run is 1000; stop early and ask for a relaunch
const MAX_STEPS_PER_RUN = A.maxStepsPerTask || 30   // stage hops per task pipeline before handing back to the orchestrator
const POLLS_PER_WATCH = A.pollsPerWatch || 25       // each poll blocks up to 100 s (stays under the 2-minute foreground limit)
const MAX_PARALLEL_TASKS = A.maxParallelTasks || 6  // task pipelines running at once (testing and prod deploys still go one at a time)
const MAX_TESTERS = A.maxTesters || 4               // parallel tester agents per test round (after one shared test deployment)
const MAX_FIX_ROUNDS = A.maxFixRounds || 4          // review or test round at which the judge/filter asks the human instead of looping again
const MAX_AUTONOMOUS_DEPTH = A.maxAutonomousDepth ?? 1 // deepest agent-proposed task the PM may mark ready without the human (0 = human requests only)

// ---------------------------------------------------------------- PM triage criteria (edit freely)
// The PM applies every criterion to every request task and every agent proposal before it may become `ready`, and
// cites the ids (C1, C2, ...) in its triage decision. Edit, add or remove entries here; nothing else needs to change.
const TRIAGE_CRITERIA = [
  { id: 'C1', name: 'Real-user reachability',
    rule: 'A real user of this single-tenant personal file storage app reaches the state in normal use, with real data, a real browser and a real file picker. A state that needs mocked API responses, synthetic listings, hand-made paths or injected delays to appear fails this check, unless it causes data loss or a security hole.' },
  { id: 'C2', name: 'Impact',
    rule: 'Rank what the user suffers: data loss or corruption > security exposure > a blocked task with no workaround > a wrong or misleading result > confusion or extra steps > cosmetic. Cosmetic-only work is never ready on its own; it may only ride along in a group (C9).' },
  { id: 'C3', name: 'Frequency',
    rule: 'Estimate how often a typical user hits it: every session, weekly, rarely, or only in edge cases. Rare together with low impact (C2) means reject.' },
  { id: 'C4', name: 'Serves a request or the roadmap',
    rule: 'Name the human request issue or roadmap item the task advances, and how. Work that only polishes code near an already delivered request is backlog at most, never ready on its own.' },
  { id: 'C5', name: 'Origin depth',
    rule: `Tasks created from a human request have depth 0; a task proposed from a depth-N task has depth N+1 (write it as \`Origin depth:\`). Depth up to ${MAX_AUTONOMOUS_DEPTH} may be marked ready by the PM. Deeper tasks go to backlog with \`Needs human: yes\` and become ready only after the human approves on the task's issue.` },
  { id: 'C6', name: 'Worth the cost',
    rule: 'One task costs about 500k tokens, about 8 agent runs and a production deploy. Would the human plausibly pay that for this change if asked? If not, reject it or group it (C9).' },
  { id: 'C7', name: 'Clear goal, reason and finished criteria',
    rule: 'The task states one goal, why it matters to a user (citing C2/C3), and its milestones, each with done criteria a tester can verify in the dev environment with real data at desktop and phone widths. If you cannot write them, the task is not ready: clarify it, or ask the human.' },
  { id: 'C8', name: 'Not a duplicate',
    rule: 'No done, open or in-flight task already covers this exact behaviour on the same page and component. Verify by reading that task\'s milestones, not its title. A partial overlap is merged into that task if it has not started, or recorded as a cross-reference.' },
  { id: 'C9', name: 'Grouping',
    rule: 'Group small independent changes of one kind (copy, colours, icons, spacing) or changes in the same user context (same page, flow or component) into ONE task, each as its own milestone. At most 5 milestones and one area of the app per task; never group backend/infra work with unrelated UI work; never group a security fix with anything that could delay it.' },
  { id: 'C10', name: 'Consistent with product decisions',
    rule: 'The task does not contradict standing human decisions in product.md, design-preferences.md, the product rules in product.md, or a behaviour an earlier task deliberately chose and tested (search the shipped tasks). Overturning one of those needs the human.' },
  { id: 'C11', name: 'Safety and reversibility',
    rule: 'Changes to stored data, DynamoDB keys or GSIs, the S3 layout, authentication, IAM, or anything irreversible are marked `Needs human: yes` and are not ready until the human approves on the task\'s issue.' },
  { id: 'C12', name: 'Security and accessibility floor',
    rule: 'A reachable security weakness (medium or higher in normal use) is always accepted with priority P1, never rejected for low user value. An accessibility problem that stops a keyboard or screen-reader user from completing a task is accepted; accessibility polish that blocks nobody follows C2 and C9.' },
]
const criteriaText = TRIAGE_CRITERIA.map(c => `- ${c.id} ${c.name}: ${c.rule}`).join('\n')

let agentsUsed = 0
// agent() can THROW (e.g. a subagent that never calls StructuredOutput). One bad agent must not kill the team:
// turn every failure into null, which callers already treat as "failed, retry later".
const call = async (prompt, opts) => {
  agentsUsed++
  try { return await agent(prompt, opts) }
  catch (e) { log(`${(opts && opts.label) || 'agent'} failed: ${String(e && e.message || e).slice(0, 200)}`); return null }
}

// ---------------------------------------------------------------- schemas
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
    ready: { type: 'array', items: { type: 'string', pattern: '^T-\\d{4}$' } },    // tasks marked ready this run
    resumed: { type: 'array', items: { type: 'string', pattern: '^T-\\d{4}$' } },  // tasks given a `Resume:` line this run
  },
  required: ['summary', 'ready', 'resumed'],
}

const STAGES = ['design', 'design-decision', 'engineering', 'review', 'judging', 'testing', 'filtering', 'deploying',
  'rebase', 'rebase-review', 'rebase-judging']
const DISPATCH = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    dispatches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          taskId: { type: 'string', pattern: '^T-\\d{4}$' },
          stage: { type: 'string', enum: STAGES },
          instructions: { type: 'string' },
        },
        required: ['taskId', 'stage', 'instructions'],
      },
    },
  },
  required: ['summary', 'dispatches'],
}

const OUTCOMES = ['awaiting-human', 'ready-for-engineering', 'pr-ready', 'rebased', 'reviewed', 'approved', 'approved-rebase',
  'changes-requested', 'deployed', 'tested', 'pass', 'fix-required', 'done', 'needs-engineering', 'needs-rebase', 'failed']
const RESULT = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: OUTCOMES },
    summary: { type: 'string' },
    proposals: { type: 'integer' },   // proposal task files (Status `proposed`) written for the PM to triage
  },
  required: ['outcome', 'summary'],
}

const TEST_PLAN = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: ['deployed', 'fix-required', 'awaiting-human', 'failed'] },
    summary: { type: 'string' },
    round: { type: 'integer' },
    assignments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', pattern: '^[a-z0-9-]{1,24}$' },
          focus: { type: 'string' },
          milestones: { type: 'array', items: { type: 'string' } },
          account: { type: 'string', enum: ['1', '2'] },
        },
        required: ['key', 'focus', 'milestones', 'account'],
      },
    },
  },
  required: ['outcome', 'summary', 'assignments'],
}

// ---------------------------------------------------------------- stages
// agentType = custom agent .claude/agents/agent-team-<role>.md; its name is how the permission gate
// (.claude/agent-team/permissions.json) knows which role is running a command.
const reviewers = mode => ({ parallel: [
  { key: 'code-review',     file: 'code-reviewer',     name: 'Code reviewer agent',     agentType: 'agent-team-code-reviewer', mode },
  { key: 'security-review', file: 'security-reviewer', name: 'Security reviewer agent', agentType: 'agent-team-security-reviewer', mode },
] })
const ROLES = {
  'design':          { file: 'design',        name: 'Design agent',       mode: 'design',          agentType: 'agent-team-design' },
  'design-decision': { file: 'design',        name: 'Design agent',       mode: 'design-decision', agentType: 'agent-team-design' },
  'engineering':     { file: 'engineering',   name: 'Engineering agent',  mode: 'implement',       agentType: 'agent-team-engineering' },
  'rebase':          { file: 'engineering',   name: 'Engineering agent',  mode: 'rebase',          agentType: 'agent-team-engineering' },
  // review = code review and security review of the same PR, in parallel; both only report findings.
  'review':          reviewers('full'),
  'rebase-review':   reviewers('rebase'),
  // judging = the review judge weighs both sets of findings.
  'judging':         { file: 'review-judge',  name: 'Review judge agent', mode: 'full',            agentType: 'agent-team-review-judge' },
  'rebase-judging':  { file: 'review-judge',  name: 'Review judge agent', mode: 'rebase',          agentType: 'agent-team-review-judge' },
  // testing = one test deployment + test plan, then up to MAX_TESTERS testers in parallel, all under the test-env lock.
  'testing':         { testing: true },
  'filtering':       { file: 'test-filter',   name: 'Test results filtering agent',                agentType: 'agent-team-test-filter' },
  'deploying':       { file: 'deployment',    name: 'Deployment agent',   lock: 'prod',            agentType: 'agent-team-deployment' },
}
const TEST_DEPLOY = { file: 'testing', name: 'Testing agent (test deployment and plan)', mode: 'test-deploy', agentType: 'agent-team-testing' }
const TESTER = { file: 'testing', name: 'Testing agent (tester)', mode: 'qa', agentType: 'agent-team-testing' }

// stage -> outcome -> next stage (missing = the pipeline stops: the task waits for the human, is done, or failed)
const TRANSITIONS = {
  'design':          { 'ready-for-engineering': 'engineering' },
  'design-decision': { 'ready-for-engineering': 'engineering' },
  'engineering':     { 'pr-ready': 'review' },
  'rebase':          { 'rebased': 'rebase-review', 'pr-ready': 'review' },   // pr-ready = the rebase needed real code changes
  'review':          { 'reviewed': 'judging' },
  'rebase-review':   { 'reviewed': 'rebase-judging' },
  'judging':         { 'approved': 'testing', 'changes-requested': 'engineering' },
  'rebase-judging':  { 'approved-rebase': 'deploying', 'approved': 'testing', 'changes-requested': 'engineering' },
  'testing':         { 'tested': 'filtering', 'fix-required': 'engineering' },
  'filtering':       { 'pass': 'deploying', 'fix-required': 'engineering' },
  'deploying':       { 'needs-engineering': 'engineering', 'needs-rebase': 'rebase' },
}

// serialize test-env use (deploy + every tester of one round) and production deploys
const locks = {}
function withLock(name, fn) {
  const prev = locks[name] || Promise.resolve()
  const run = prev.then(fn, fn)
  locks[name] = run.catch(() => {})
  return run
}

// Both reviewers must finish (outcome "reviewed") before the judge runs; a crash or anything else stops the
// pipeline and the orchestrator re-dispatches the review.
function combineReviews(parts) {
  if (parts.some(p => !p.res)) return null
  const outcome = parts.every(p => p.res.outcome === 'reviewed') ? 'reviewed' : 'failed'
  return { outcome, summary: parts.map(p => `${p.key}: ${p.res.outcome} - ${p.res.summary}`).join(' | ') }
}

function stagePrompt(r, taskId, instructions, extra = []) {
  return [
    `You are the ${r.name} of an autonomous product team.`,
    `REPO = ${REPO}. First read ${SKILL}/roles/_shared.md, then ${SKILL}/roles/${r.file}.md, and follow them exactly.`,
    `Task: ${taskId} (task file: ${MEM}/tasks/${taskId}.md). Comment only on this task's own issue (its \`Issue:\` line).`,
    r.mode ? `Mode: \`${r.mode}\`.` : '',
    `Fix-round limit: ${MAX_FIX_ROUNDS} (at that review or test round, ask the human instead of sending the task back again).`,
    ...extra,
    `Why you were called: ${instructions}`,
    `Return the outcome your role file specifies and a 1-3 sentence summary.`,
  ].filter(Boolean).join('\n')
}

// One test deployment and plan, then the testers in parallel, all inside the test-env lock so no other task
// replaces the dev deployment while it is being tested.
async function runTesting(taskId, instructions) {
  return withLock('test-env', async () => {
    const plan = await call(stagePrompt(TEST_DEPLOY, taskId, instructions, [`Plan at most ${MAX_TESTERS} tester assignments.`]),
      { label: `${taskId} test-deploy`, phase: 'Tasks', schema: TEST_PLAN, agentType: TEST_DEPLOY.agentType })
    if (!plan) return null
    log(`${taskId} test-deploy → ${plan.outcome}: ${plan.summary}`)
    if (plan.outcome !== 'deployed') return { outcome: plan.outcome, summary: plan.summary }
    const assignments = (plan.assignments || []).slice(0, MAX_TESTERS)
    if (!assignments.length) return { outcome: 'failed', summary: 'test plan had no assignments' }
    const parts = await Promise.all(assignments.map(a => call(stagePrompt(TESTER, taskId, instructions, [
      `Test round: ${plan.round || '(see the task file)'}. Your assignment (key \`${a.key}\`, test account ${a.account}):`,
      JSON.stringify(a),
      `Other testers run at the same time on other assignments: ${assignments.filter(b => b.key !== a.key).map(b => b.key).join(', ') || 'none'}.`,
    ]), { label: `${taskId} qa:${a.key}`, phase: 'Tasks', schema: RESULT, agentType: TESTER.agentType })
      .then(res => ({ key: a.key, res }))))
    if (parts.some(p => !p.res)) return null
    parts.forEach(p => log(`${taskId} qa:${p.key} → ${p.res.outcome}`))
    const outcome = parts.some(p => p.res.outcome === 'awaiting-human') ? 'awaiting-human'
      : parts.every(p => p.res.outcome === 'tested') ? 'tested' : 'failed'
    return { outcome, summary: parts.map(p => `${p.key}: ${p.res.summary}`).join(' | ') }
  })
}

async function runTask(d, entry) {
  let stage = d.stage
  let instructions = d.instructions
  let proposals = 0
  for (let step = 0; step < MAX_STEPS_PER_RUN; step++) {
    if (agentsUsed >= MAX_AGENTS) { log(`${d.taskId}: agent budget reached, pausing at ${stage}`); return { taskId: d.taskId, stoppedAt: stage, proposals } }
    entry.stage = stage
    const r = ROLES[stage]
    const one = (role, label) => call(stagePrompt(role, d.taskId, instructions), {
      label, phase: 'Tasks', schema: RESULT, agentType: role.agentType,
    })
    let res
    if (r.testing) res = await runTesting(d.taskId, instructions)
    else {
      const go = r.parallel
        ? () => Promise.all(r.parallel.map(p => one(p, `${d.taskId} ${stage}:${p.key}`).then(res => ({ key: p.key, res }))))
            .then(parts => { parts.filter(p => p.res).forEach(p => log(`${d.taskId} ${p.key} → ${p.res.outcome}`)); return combineReviews(parts) })
        : () => one(r, `${d.taskId} ${stage}`)
      res = r.lock ? await withLock(r.lock, go) : await go()
    }
    if (!res) { log(`${d.taskId}: ${stage} agent failed; the orchestrator will re-dispatch`); return { taskId: d.taskId, stoppedAt: stage, proposals } }
    log(`${d.taskId} ${stage} → ${res.outcome}: ${res.summary}`)
    if (res.proposals > 0) { proposals += res.proposals; needPm() }
    const next = (TRANSITIONS[stage] || {})[res.outcome]
    if (!next) return { taskId: d.taskId, stoppedAt: stage, outcome: res.outcome, proposals }
    instructions = `Previous stage (${stage}) finished with "${res.outcome}": ${res.summary}`
    stage = next
  }
  log(`${d.taskId}: hit ${MAX_STEPS_PER_RUN} stage hops; handing back to the orchestrator`)
  return { taskId: d.taskId, stoppedAt: stage, proposals }
}

// ---------------------------------------------------------------- coordinators
const running = new Map()   // taskId -> { promise, stage }
let pmNeeded = true         // first PM run: triage leftovers and new events
let orchNeeded = true       // first orchestrator run: resume tasks that were mid-pipeline (crash recovery)
let pmP = null, orchP = null, watchP = null
let pendingEvents = []
let pmFailures = 0, orchFailures = 0
let wake, wakeP
const resetWake = () => { wakeP = new Promise(r => { wake = r }) }
resetWake()
// Wake the main loop. Set the flag BEFORE calling this: the loop reads the flags right after it wakes up.
function wakeLoop() { const w = wake; resetWake(); w({ kind: 'wake' }) }
function needPm() { pmNeeded = true; wakeLoop() }
function needOrch() { orchNeeded = true; wakeLoop() }

const runningText = () => [...running.entries()].map(([t, e]) => `${t} (${e.stage})`).join(', ') || 'none'

function startPm() {
  const events = pendingEvents
  pendingEvents = []
  pmNeeded = false
  pmP = call([
    `You are the Product Manager agent of an autonomous product team.`,
    `REPO = ${REPO}. First read ${SKILL}/roles/_shared.md, then ${SKILL}/roles/product-manager.md, and follow them exactly.`,
    `New GitHub events from the human (oldest first):`,
    events.length ? JSON.stringify(events, null, 2) : '(none - triage pending proposals, review the backlog, close finished requests)',
    `Task pipelines running right now (the Delivery Orchestrator owns them; only record new human input in their task files): ${runningText()}.`,
    `Triage criteria (apply every one; cite the ids in each triage decision):`,
    criteriaText,
  ].join('\n'), { label: `PM (${events.length} events)`, phase: 'PM', schema: PM_RESULT, agentType: 'agent-team-pm' })
    .then(res => {
      pmP = null
      if (!res) {
        // events were not acked, so the poller delivers them again; only a sweep needs an explicit retry
        pmFailures++
        log(`PM agent failed (${pmFailures} in a row); its events stay unacknowledged and will be redelivered`)
        if (!events.length && pmFailures < 3) pmNeeded = true   // else wait for the next event or pipeline end
      } else {
        pmFailures = 0
        log(`PM: ${res.summary}`)
        if ((res.ready || []).length || (res.resumed || []).length) orchNeeded = true
      }
      wakeLoop()
    })
}

function startOrch() {
  orchNeeded = false
  orchP = call([
    `You are the Delivery Orchestrator agent of an autonomous product team.`,
    `REPO = ${REPO}. First read ${SKILL}/roles/_shared.md, then ${SKILL}/roles/delivery-orchestrator.md, and follow them exactly.`,
    `Task pipelines running right now (do not dispatch these): ${runningText()}.`,
    `Capacity: at most ${MAX_PARALLEL_TASKS} task pipelines at once, so you may start up to ${Math.max(0, MAX_PARALLEL_TASKS - running.size)} now.`,
  ].join('\n'), { label: 'Delivery orchestrator', phase: 'Delivery', schema: DISPATCH, agentType: 'agent-team-delivery-orchestrator' })
    .then(plan => {
      orchP = null
      if (!plan) {
        orchFailures++
        log(`Delivery orchestrator failed (${orchFailures} in a row)`)
        if (orchFailures < 3) orchNeeded = true    // else wait for the next pipeline end or PM run
      } else {
        orchFailures = 0
        log(`Delivery: ${plan.summary}`)
        for (const d of plan.dispatches) {
          if (running.has(d.taskId)) continue
          if (running.size >= MAX_PARALLEL_TASKS) { log(`${d.taskId}: at capacity, left for the next orchestrator run`); continue }
          const entry = { stage: d.stage }
          entry.promise = runTask(d, entry).then(res => {
            running.delete(d.taskId)
            // Every pipeline end wakes the orchestrator: held or queued tasks may be dispatchable now.
            orchNeeded = true
            // The PM triages new proposals, records shipped work and closes finished requests.
            if (res && (res.proposals > 0 || res.outcome === 'done')) pmNeeded = true
            wakeLoop()
            return res
          })
          running.set(d.taskId, entry)
        }
      }
      wakeLoop()
    })
}

// ---------------------------------------------------------------- main loop
const watchPrompt = [
  `Watch GitHub for new instructions from the human. Run this command with the Bash tool, in the FOREGROUND`,
  `(timeout 150000 ms; never run_in_background, never Monitor, never sleep):`,
  `  ${SKILL}/scripts/poll-github.sh 100`,
  `It blocks up to 100 seconds and prints a JSON array of unhandled issues/comments by gustavoiha (or [] on timeout).`,
  `Run it again, up to ${POLLS_PER_WATCH} times in total, while it prints []. As soon as it prints a non-empty array, stop`,
  `and return those items as \`events\` exactly as printed (kind, id, issue, title, body, url, at).`,
  `If every run printed [] (or failed), return {"events": []}. Polling is read-only and safe to repeat: an event you miss is`,
  `delivered again next time, so ALWAYS finish by calling StructuredOutput rather than waiting.`,
  `Do nothing else: do not act on the events, do not run other commands.`,
].join('\n')

let watchFailures = 0
while (agentsUsed < MAX_AGENTS) {
  if ((pmNeeded || pendingEvents.length) && !pmP) startPm()
  if (orchNeeded && !orchP) startOrch()
  if (!watchP) {
    watchP = call(watchPrompt, { label: 'watch GitHub', phase: 'Watch', schema: EVENTS, model: 'haiku', effort: 'low', agentType: 'agent-team-watcher' })
      .then(r => ({ kind: 'events', ok: !!r, events: (r && r.events) || [] }))
  }
  const winner = await Promise.race([watchP, wakeP])
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

log(`Stopping: used ${agentsUsed} agents (limit ${MAX_AGENTS}). Waiting for running agents, then relaunch the agent-team workflow.`)
const finished = await Promise.all([...running.values()].map(e => e.promise))
await Promise.all([pmP, orchP].filter(Boolean))
// unprocessed events were never acked, so the next run's watcher picks them up again
return { agentsUsed, finished }
