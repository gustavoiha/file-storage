#!/usr/bin/env node
// Applies .claude/agent-team/permissions.json to .claude/settings.local.json:
//  - permissions.allow gets the union of every role's allow patterns ($SKILL expanded), so auto mode approves them;
//    entries this script added before and that are no longer listed are removed; your own entries are kept.
//  - a PreToolUse hook (matcher Bash) running permission-gate.mjs is installed once, which keeps each command
//    limited to the roles that list it.
// Usage: node .claude/skills/agent-team/scripts/sync-permissions.mjs [--check]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, compile } from './permission-gate.mjs'

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(SKILL, '../../..')
const SETTINGS = `${REPO}/.claude/settings.local.json`
const MANAGED = `${REPO}/.agent-local/managed-allow.json`
const HOOK_CMD = `node "${SKILL}/scripts/permission-gate.mjs"`

const cfg = loadConfig()
const union = [...new Set([...(cfg.shared || []), ...Object.values(cfg.roles).flatMap(r => r.allow)])]
const bad = [...union, ...cfg.globalDeny, ...Object.values(cfg.roles).flatMap(r => r.deny)].filter(p => !compile(p))
if (bad.length) { console.error('Not Bash(...) patterns:', bad); process.exit(1) }

const settings = existsSync(SETTINGS) ? JSON.parse(readFileSync(SETTINGS, 'utf8')) : {}
const prevManaged = existsSync(MANAGED) ? JSON.parse(readFileSync(MANAGED, 'utf8')) : []
settings.permissions ??= {}
const own = (settings.permissions.allow || []).filter(p => !prevManaged.includes(p) && !union.includes(p))
settings.permissions.allow = [...own, ...union]

settings.hooks ??= {}
settings.hooks.PreToolUse ??= []
const has = settings.hooks.PreToolUse.some(h => (h.hooks || []).some(x => x.command === HOOK_CMD))
if (!has) settings.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: HOOK_CMD, timeout: 10 }] })

if (process.argv.includes('--check')) { console.log(JSON.stringify(settings, null, 2)); process.exit(0) }
writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n')
mkdirSync(dirname(MANAGED), { recursive: true })
writeFileSync(MANAGED, JSON.stringify(union, null, 2) + '\n')
console.log(`settings.local.json: ${union.length} agent-team allow rules, ${own.length} of your own kept, gate hook ${has ? 'already present' : 'installed'}.`)
