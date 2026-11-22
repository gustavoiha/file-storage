#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Enforces per-role permissions from .claude/agent-team/permissions.json for
// agent-team workflow agents (agent_type "agent-team-<role>"). Prints nothing for every other caller, so the
// main session and other subagents keep their normal permission flow, except that commands reserved for an
// agent-team role are blocked for other subagents.
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
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
  const fp = cfg.forcePush || {}
  return {
    globalDeny: expand(cfg.globalDeny), shared: expand((cfg.allAgents || {}).allow), roles,
    forcePush: { allowWithLease: fp.allowWithLease === true, protectedBranches: fp.protectedBranches || ['main'] },
  }
}

// Shell words of one simple command (quotes removed, no expansion). Words holding $, ` or a glob stay as written.
function words(s) {
  const out = []; let cur = ''; let q = null; let has = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) { if (c === q) q = null; else if (c === '\\' && q === '"' && i + 1 < s.length) cur += s[++i]; else cur += c; continue }
    if (c === "'" || c === '"') { q = c; has = true; continue }
    if (c === '\\' && i + 1 < s.length) { cur += s[++i]; has = true; continue }
    if (/\s/.test(c)) { if (has || cur) out.push(cur); cur = ''; has = false; continue }
    cur += c
  }
  if (has || cur) out.push(cur)
  return out
}

// Parses `git [-C dir] [-c k=v] push ...`. Returns null when the command is not a git push.
export function parsePush(sub) {
  const w = words(sub)
  let i = 0
  while (i < w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[i])) i++ // VAR=value prefixes
  if (w[i] !== 'git') return null
  i++
  let dir = null
  while (i < w.length && w[i].startsWith('-')) {
    if (w[i] === '-C') { dir = dir ? resolve(dir, w[i + 1] || '') : w[i + 1]; i += 2 }
    else if (w[i] === '-c' || w[i] === '--git-dir' || w[i] === '--work-tree' || w[i] === '--namespace') i += 2
    else i++
  }
  if (w[i] !== 'push') return null
  const opts = []; const pos = []
  for (i++; i < w.length; i++) {
    const a = w[i]
    if (a === '--') { pos.push(...w.slice(i + 1)); break }
    if (/^[0-9]*>/.test(a) || a.startsWith('<')) { if (/^[0-9]*>>?$|^<$/.test(a)) i++; continue } // redirections
    if (a.startsWith('-')) {
      opts.push(a)
      if (['--repo', '-o', '--push-option', '--receive-pack', '--exec'].includes(a)) i++
    } else pos.push(a)
  }
  const has = re => opts.some(o => re.test(o))
  return {
    dir,
    remote: pos[0] || null,
    refspecs: pos.slice(1),
    lease: has(/^--force-with-lease(=|$)/) || has(/^--force-if-includes$/),
    force: has(/^--force$/) || has(/^-[a-zA-Z]*f[a-zA-Z]*$/) || has(/^--(mirror|all|branches|prune)$/) || pos.slice(1).some(r => r.startsWith('+')),
    del: has(/^--delete$/) || has(/^-[a-zA-Z]*d[a-zA-Z]*$/) || pos.slice(1).some(r => r.startsWith(':')),
  }
}

const currentBranch = dir => {
  try { return execFileSync('git', ['-C', dir, 'symbolic-ref', '-q', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim() || null }
  catch { return null }
}

// Force-push policy: plain --force/-f/+refspec/--mirror is denied; --force-with-lease is allowed only when every
// target branch can be named and none is protected. Returns a deny reason or null.
export function checkForcePush(cfg, subs, cwd, branchOf = currentBranch) {
  let dir = cwd || process.cwd()
  for (const s of subs) {
    const w = words(s)
    if (w[0] === 'cd') { dir = w[1] && !/[$`*?~]/.test(w[1]) ? resolve(dir, w[1]) : null; continue }
    const p = parsePush(s)
    if (!p || !(p.force || p.lease || p.del)) continue
    const fp = cfg.forcePush
    if (p.force) return `"${s}": plain force push (--force, -f, +refspec, --mirror, --all, --prune) is denied. Use \`git push --force-with-lease origin <your-branch>\`, never on ${fp.protectedBranches.join(' or ')}.`
    if (p.lease && !fp.allowWithLease) return `"${s}": force push is denied by forcePush in .claude/agent-team/permissions.json. Update the branch with a merge from origin/main instead.`
    const d = p.dir ? (dir ? resolve(dir, p.dir) : (p.dir.startsWith('/') ? p.dir : null)) : dir
    const targets = []
    const refs = p.refspecs.length ? p.refspecs : ['HEAD']
    for (const r of refs) {
      let dst = r.includes(':') ? r.slice(r.indexOf(':') + 1) : r
      if (dst === 'HEAD' || dst === '@' || dst === '') dst = d && !/[$`]/.test(d) ? branchOf(d) : null
      targets.push(dst)
    }
    const name = t => t && t.replace(/^refs\/heads\//, '')
    if (targets.some(t => !t || /[$`*?]/.test(t)))
      return `"${s}": cannot tell which branch this force push targets. Name it literally: \`git push --force-with-lease origin <your-branch>\`.`
    const hit = targets.map(name).find(t => fp.protectedBranches.includes(t))
    if (hit) return `"${s}": force push or delete on ${hit} is never allowed. Do not try another way: ask the human on the task's issue.`
  }
  return null
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

export function decide(cfg, agentType, command, cwd) {
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
  const fpDeny = checkForcePush(cfg, subs, cwd)
  if (fpDeny) return { decision: 'deny', reason: fpDeny }
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
  try { result = decide(loadConfig(), agentType, command, input.cwd) }
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
