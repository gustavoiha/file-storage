#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Enforces per-role permissions from .claude/agent-team/permissions.json for
// agent-team workflow agents (agent_type "agent-team-<role>"). Prints nothing for every other caller, so the
// main session and other subagents keep their normal permission flow, except that commands reserved for an
// agent-team role are blocked for other subagents.
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(SKILL, '../../..')
const CONFIG = `${REPO}/.claude/agent-team/permissions.json`
const LOG = `${REPO}/.agent-local/logs/permission-gate.log`

export function loadConfig(path = CONFIG) {
  const cfg = JSON.parse(readFileSync(path, 'utf8'))
  const expand = list => (list || []).map(p => p.replaceAll('$SKILL', SKILL))
  const roles = {}
  for (const [name, r] of Object.entries(cfg.roles || {})) roles[name] = { allow: expand(r.allow), deny: expand(r.deny) }
  return { globalDeny: expand(cfg.globalDeny), shared: expand((cfg.allAgents || {}).allow), roles }
}

// "Bash(x)" -> matcher on a command string. "x *" / "x:*" = prefix, other "*" = wildcard, else exact.
export function compile(rule) {
  const m = /^Bash\((.*)\)$/s.exec(rule.trim())
  if (!m) return null
  let body = m[1]
  if (body.endsWith(':*')) body = body.slice(0, -2) + ' *'
  if (body.endsWith(' *') && !body.slice(0, -2).includes('*')) {
    const prefix = body.slice(0, -2)
    return cmd => cmd === prefix || cmd.startsWith(prefix + ' ')
  }
  if (body.includes('*')) {
    const re = new RegExp('^' + body.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 's')
    return cmd => re.test(cmd)
  }
  return cmd => cmd === body
}

// Split a shell command into simple commands on && || ; | & and newlines, outside quotes.
export function split(command) {
  const parts = []; let cur = ''; let q = null
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    if (q) { cur += c; if (c === q && command[i - 1] !== '\\') q = null; continue }
    if (c === "'" || c === '"') { q = c; cur += c; continue }
    if (c === '\n' || c === ';') { parts.push(cur); cur = ''; continue }
    if ((c === '&' || c === '|') ) {
      if (command[i + 1] === c) i++
      else if (c === '|' && command[i + 1] === '&') i++
      if (c === '&' && (command[i - 1] === '>' || command[i + 1] === '>')) { cur += c; continue } // 2>&1, &>
      parts.push(cur); cur = ''; continue
    }
    cur += c
  }
  parts.push(cur)
  return parts.map(s => s.trim()).filter(Boolean)
}

const matchesAny = (cmd, rules) => rules.some(r => { const f = compile(r); return f && f(cmd) })
const isCd = s => /^cd(\s|$)/.test(s)

export function decide(cfg, agentType, command) {
  const subs = split(command)
  const role = agentType && agentType.startsWith('agent-team-') ? agentType.slice('agent-team-'.length) : null
  const reservedBy = sub => Object.entries(cfg.roles).filter(([, r]) => matchesAny(sub, r.allow)).map(([n]) => n)

  if (!role) {
    // Not an agent-team agent. Main thread (no agent_type): no opinion. Other subagents: block reserved commands.
    if (!agentType) return null
    for (const s of subs) {
      const owners = reservedBy(s)
      if (owners.length) return { decision: 'deny', reason: `"${s}" is reserved for agent-team role(s) ${owners.join(', ')}.` }
    }
    return null
  }
  const r = cfg.roles[role]
  if (!r) return { decision: 'deny', reason: `Agent type ${agentType} has no entry in .claude/agent-team/permissions.json. Ask the human to add one.` }
  if (matchesAny(command, cfg.globalDeny) || subs.some(s => matchesAny(s, cfg.globalDeny)))
    return { decision: 'deny', reason: `Blocked by globalDeny in .claude/agent-team/permissions.json. Do not try another way: ask the human on the task's issue.` }
  for (const s of subs) {
    if (matchesAny(s, r.deny)) return { decision: 'deny', reason: `"${s}" is denied for role ${role}. Do not try another way: ask the human on the task's issue.` }
    const owners = reservedBy(s)
    if (owners.length && !owners.includes(role))
      return { decision: 'deny', reason: `"${s}" is reserved for role(s) ${owners.join(', ')}, not ${role}. Do not try another way: if your task needs it, ask the human on the task's issue.` }
  }
  const relevant = subs.filter(s => !isCd(s))
  if (relevant.length && relevant.every(s => matchesAny(s, r.allow) || matchesAny(s, cfg.shared || []))) return { decision: 'allow', reason: `Allowed for role ${role} by .claude/agent-team/permissions.json.` }
  return null
}

async function main() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  let input
  try { input = JSON.parse(raw) } catch { return }
  if (input.tool_name !== 'Bash') return
  const command = (input.tool_input && input.tool_input.command) || ''
  const agentType = input.agent_type || null
  let result
  try { result = decide(loadConfig(), agentType, command) }
  catch (e) {
    // Broken config: fail closed for agent-team agents only.
    if (agentType && agentType.startsWith('agent-team-')) result = { decision: 'deny', reason: `permission-gate error (${e.message}); ask the human to fix .claude/agent-team/permissions.json.` }
    else return
  }
  try {
    mkdirSync(dirname(LOG), { recursive: true })
    if (agentType || result) appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), agent: agentType, decision: result ? result.decision : 'passthrough', command: command.slice(0, 300) }) + '\n')
  } catch {}
  if (!result) return
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: result.decision, permissionDecisionReason: result.reason } }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
