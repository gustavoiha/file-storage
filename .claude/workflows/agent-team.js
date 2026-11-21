export const meta = {
  name: 'agent-team',
  description: 'Long-running product team: watches GitHub issues by gustavoiha and runs PM → design → engineering → code + security review → review judge → testing → filtering → deployment',
  whenToUse: 'Start or restart the autonomous agent team for gustavoiha/file-storage. State lives in the agent-memory branch, so a relaunch resumes where it stopped.',
  phases: [
    { title: 'Watch', detail: 'poll GitHub for new issues/comments by gustavoiha' },
    { title: 'PM', detail: 'product manager triages events and dispatches tasks' },
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
const MAX_AGENTS = A.maxAgents || 900          // hard cap per run is 1000; stop early and ask for a relaunch
const MAX_STEPS_PER_RUN = A.maxStepsPerTask || 25 // stage hops per task pipeline before handing back to PM
const POLLS_PER_WATCH = A.pollsPerWatch || 25    // each poll blocks up to 100 s (stays under the 2-minute foreground limit)

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
          stage: { type: 'string', enum: ['design', 'design-decision', 'engineering', 'review', 'judging', 'testing', 'filtering', 'deploying'] },
          instructions: { type: 'string' },
        },
        required: ['taskId', 'stage', 'instructions'],
      },
    },
  },
  required: ['summary', 'dispatches'],
}

const OUTCOMES = ['awaiting-human', 'ready-for-engineering', 'pr-ready', 'reviewed', 'approved', 'changes-requested',
  'tested', 'pass', 'fix-required', 'done', 'needs-engineering', 'failed']
const RESULT = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: OUTCOMES },
    summary: { type: 'string' },
    newTasks: { type: 'integer' },
  },
  required: ['outcome', 'summary'],
}

// ---------------------------------------------------------------- stages
// agentType = custom agent .claude/agents/agent-team-<role>.md; its name is how the permission gate
// (.claude/agent-team/permissions.json) knows which role is running a command.
const ROLES = {
  'design':          { file: 'design',        name: 'Design agent',             mode: 'design',          agentType: 'agent-team-design' },
  'design-decision': { file: 'design',        name: 'Design agent',             mode: 'design-decision', agentType: 'agent-team-design' },
  'engineering':     { file: 'engineering',   name: 'Engineering agent',                                 agentType: 'agent-team-engineering' },
  // review = code review and security review of the same PR, run in parallel; both only report findings.
  // judging = the review judge weighs both sets of findings: critical → engineering, separate → new task, else discard.
  'review':          { parallel: [
                       { key: 'code-review',     file: 'code-reviewer',     name: 'Code reviewer agent',     agentType: 'agent-team-code-reviewer' },
                       { key: 'security-review', file: 'security-reviewer', name: 'Security reviewer agent', agentType: 'agent-team-security-reviewer' },
                     ] },
  'judging':         { file: 'review-judge',  name: 'Review judge agent',                                agentType: 'agent-team-review-judge' },
  'testing':         { file: 'testing',       name: 'Testing agent',            lock: 'test-env',        agentType: 'agent-team-testing' },
  'filtering':       { file: 'test-filter',   name: 'Test results filtering agent',                      agentType: 'agent-team-test-filter' },
  'deploying':       { file: 'deployment',    name: 'Deployment agent',         lock: 'prod',            agentType: 'agent-team-deployment' },
}

// outcome -> next stage (undefined = pipeline stops; task waits for the human or is done)
const NEXT = {
  'ready-for-engineering': 'engineering',
  'pr-ready': 'review',
  'reviewed': 'judging',
  'approved': 'testing',
  'changes-requested': 'engineering',
  'tested': 'filtering',
  'pass': 'deploying',
  'fix-required': 'engineering',
  'needs-engineering': 'engineering',
}

// serialize testing (one PR at a time on the test env) and production deploys
const locks = {}
function withLock(name, fn) {
  const prev = locks[name] || Promise.resolve()
  const run = prev.then(fn, fn)
  locks[name] = run.catch(() => {})
  return run
}

// Both reviewers must finish (outcome "reviewed") before the judge runs; a crash or anything else stops the
// pipeline and the PM re-dispatches the review.
function combineReviews(parts) {
  if (parts.some(p => !p.res)) return null
  const outcome = parts.every(p => p.res.outcome === 'reviewed') ? 'reviewed' : 'failed'
  return { outcome, summary: parts.map(p => `${p.key}: ${p.res.outcome} - ${p.res.summary}`).join(' | ') }
}

function stagePrompt(r, taskId, instructions) {
  return [
    `You are the ${r.name} of an autonomous product team.`,
    `REPO = ${REPO}. First read ${SKILL}/roles/_shared.md, then ${SKILL}/roles/${r.file}.md, and follow them exactly.`,
    `Task: ${taskId} (task file: ${MEM}/tasks/${taskId}.md). Comment only on this task's own issue (its \`Issue:\` line).`,
    r.mode ? `Mode: \`${r.mode}\`.` : '',
    `Why you were called: ${instructions}`,
    `Return the outcome your role file specifies and a 1-3 sentence summary.`,
  ].filter(Boolean).join('\n')
}

async function runTask(d) {
  let stage = d.stage
  let instructions = d.instructions
  for (let step = 0; step < MAX_STEPS_PER_RUN; step++) {
    if (agentsUsed >= MAX_AGENTS) { log(`${d.taskId}: agent budget reached, pausing at ${stage}`); return { taskId: d.taskId, stoppedAt: stage, pmNeeded: false } }
    const r = ROLES[stage]
    const one = (role, label) => call(stagePrompt(role, d.taskId, instructions), {
      label, phase: 'Tasks', schema: RESULT, agentType: role.agentType,
    })
    const go = r.parallel
      ? () => Promise.all(r.parallel.map(p => one(p, `${d.taskId} ${p.key}`).then(res => ({ key: p.key, res }))))
          .then(parts => { parts.filter(p => p.res).forEach(p => log(`${d.taskId} ${p.key} → ${p.res.outcome}`)); return combineReviews(parts) })
      : () => one(r, `${d.taskId} ${stage}`)
    const res = r.lock ? await withLock(r.lock, go) : await go()
    if (!res) { log(`${d.taskId}: ${stage} agent failed; PM will re-dispatch`); return { taskId: d.taskId, stoppedAt: stage, pmNeeded: true } }
    log(`${d.taskId} ${stage} → ${res.outcome}: ${res.summary}`)
    const newTasks = res.newTasks || 0
    const next = NEXT[res.outcome]
    if (!next) return { taskId: d.taskId, stoppedAt: stage, outcome: res.outcome, pmNeeded: newTasks > 0 || res.outcome === 'failed' }
    if (newTasks > 0) wakePm()
    instructions = `Previous stage (${stage}) finished with "${res.outcome}": ${res.summary}`
    stage = next
  }
  log(`${d.taskId}: hit ${MAX_STEPS_PER_RUN} stage hops; handing back to PM`)
  return { taskId: d.taskId, stoppedAt: stage, pmNeeded: true }
}

// ---------------------------------------------------------------- main loop
const running = new Map()   // taskId -> promise
let pmNeeded = true         // first PM run sweeps the board (resume after restart)
let pendingEvents = []
let watchP = null
let wake = null
let wakeP = new Promise(r => { wake = r })
function wakePm() { pmNeeded = true; const w = wake; wakeP = new Promise(r => { wake = r }); w('pm') }

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

const ticks = []
let watchFailures = 0
while (agentsUsed < MAX_AGENTS) {
  if (pmNeeded || pendingEvents.length) {
    const events = pendingEvents
    pendingEvents = []
    pmNeeded = false
    const plan = await call([
      `You are the Product Manager agent of an autonomous product team.`,
      `REPO = ${REPO}. First read ${SKILL}/roles/_shared.md, then ${SKILL}/roles/product-manager.md, and follow them exactly.`,
      `New GitHub events from the human (oldest first):`,
      events.length ? JSON.stringify(events, null, 2) : '(none - this is a board sweep)',
      `Task pipelines running right now (do not dispatch these; just record new human input in their task files): ${[...running.keys()].join(', ') || 'none'}.`,
    ].join('\n'), { label: `PM (${events.length} events)`, phase: 'PM', schema: DISPATCH, agentType: 'agent-team-pm' })
    if (!plan) {
      // events were not acked, so the poller delivers them again; just make sure the PM runs again soon
      log('PM agent failed; its events stay unacknowledged and will be redelivered')
      if (!events.length) pmNeeded = true
    } else {
      log(`PM: ${plan.summary}`)
      ticks.push({ events: events.length, dispatched: plan.dispatches.map(d => `${d.taskId}:${d.stage}`) })
      for (const d of plan.dispatches) {
        if (running.has(d.taskId)) continue
        const p = runTask(d).then(res => {
          running.delete(d.taskId)
          if (res && res.pmNeeded) wakePm()
          else { const w = wake; wakeP = new Promise(r => { wake = r }); w('task-done') }
          return res
        })
        running.set(d.taskId, p)
      }
    }
  }

  if (!watchP) {
    watchP = call(watchPrompt, { label: 'watch GitHub', phase: 'Watch', schema: EVENTS, model: 'haiku', effort: 'low', agentType: 'agent-team-watcher' })
      .then(r => ({ kind: 'events', ok: !!r, events: (r && r.events) || [] }))
  }
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

log(`Stopping: used ${agentsUsed} agents (limit ${MAX_AGENTS}). Waiting for running task pipelines, then relaunch the agent-team workflow.`)
const finished = await Promise.all([...running.values()])
// unprocessed events were never acked, so the next run's watcher picks them up again
return { agentsUsed, ticks, finished }
