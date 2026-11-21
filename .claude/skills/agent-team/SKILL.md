---
name: agent-team
description: Start, restart, or check the autonomous agent team for gustavoiha/file-storage (PM, design, engineering, code review, security review, testing, test filtering, deployment) that reacts to GitHub issues and comments by gustavoiha. Use when the user says "start the agent team", "relaunch the workflow", "/agent-team", or asks about its state.
---

# Agent team

A long-running Workflow (`.claude/workflows/agent-team.js`) that watches GitHub and routes work:

```
GitHub issue/comment by gustavoiha (a "request")
   → Product Manager (tasks + roadmap in memory; one issue per task, sub-issue of the request,
     card on the GitHub Project "Dockspace Agent Team" with a Stage column)
   → design (3 options, human picks on the task's issue) → design-decision
   → engineering (PR "T-XXXX: …")
   → code review + security review (in parallel, findings only)
   → review judge (critical → back to engineering; important → new task; else discard)
   → testing (test env, headless browser)
   → test-results filtering (critical → back to engineering; important → new task; else discard)
   → deployment (checks, squash-merge, prod deploy, notify the task's issue) → done
```
Agents comment only on their own task's issue; the request issue only shows the linked sub-issues.

- Role prompts: `roles/*.md` (edit these to change agent behavior; no script change needed).
- Scripts: `scripts/poll-github.sh` (blocking GitHub poller), `scripts/memory-sync.sh` (pull/commit/push memory),
  `scripts/screenshot.mjs` (headless Chromium PNG of an HTML file or URL), `scripts/github-project.sh`
  (board + task issues), `scripts/test-deploy.sh T-XXXX infra|web` (dev, profile `file-storage-dev-agent`), `scripts/prod-deploy.sh
  diff|diff-pr N|infra|web` (prod, always from a clean origin/main worktree, profile `file-storage-prod-agent`).
- **Per-agent permissions:** `.claude/agent-team/permissions.json` is the one place to edit them. Each role has
  allow/deny Bash patterns; `globalDeny` applies to all. Workflow agents run as custom agents
  `.claude/agents/agent-team-<role>.md`; the PreToolUse hook `scripts/permission-gate.mjs` (installed in
  `.claude/settings.local.json`) approves a role's listed commands, blocks commands reserved for other roles and
  denied ones, and leaves the rest to the normal permission flow. After editing permissions.json run
  `node .claude/skills/agent-team/scripts/sync-permissions.mjs`. Decisions are logged to
  `.agent-local/logs/permission-gate.log`.
- Design output: each round = static HTML mockups in `.agent-local/design/T-XXXX/`, PNG screenshots committed to
  `agent-memory` under `design/T-XXXX/round-N/` and embedded in the issue comment (raw.githubusercontent URLs;
  the repo is public). No Claude Design canvas or other artifact is published.
- Playwright + Chromium + axe live in `.agent-local/tools` (`npm i playwright @axe-core/playwright` there and
  `npx playwright install chromium` if missing).
- Memory: branch `agent-memory`, checked out at `.agent-team/` (product.md, design-preferences.md,
  engineering-lessons.md, tasks/T-XXXX.md).
- Local, never committed (`.git/info/exclude`): `.agent-local/` with `state.json` (poller cursor),
  `test-accounts.env` (TEST_APP_URL, TEST_USER_1/2 email+password), `worktrees/`, `logs/`.

## Launch / relaunch
1. Preflight (fix anything missing before launching):
   - `gh auth status` logged in as gustavoiha; `aws sts get-caller-identity` works for the deploy profile.
   - `.agent-team` exists and is the `agent-memory` worktree (`git worktree list`). If missing:
     `git worktree add .agent-team agent-memory` (or create the branch with the README layout above).
   - `.agent-local/state.json` exists (`{"since":"<ISO time>","seen":[]}`) and `test-accounts.env` is filled in.
   - `.agent-team/` and `.agent-local/` are listed in `.git/info/exclude`.
   - AWS profile `file-storage-prod-agent` (role `dockspace-prod-agent-deployer`, assumed from IAM user
     `dockspace-prod-agent` via profile `file-storage-prod-agent-user`) works:
     `AWS_PROFILE=file-storage-prod-agent aws sts get-caller-identity`. It is the only prod access agents get.
   - AWS profile `file-storage-dev-agent` (role `dockspace-dev-agent-deployer`, assumed from IAM user
     `dockspace-dev-agent` via profile `file-storage-dev-agent-user`) works:
     `AWS_PROFILE=file-storage-dev-agent aws sts get-caller-identity`. It is the only dev access agents get.
   - `node .claude/skills/agent-team/scripts/sync-permissions.mjs` has been run (settings.local.json holds the
     role allow rules and the gate hook; the file is excluded from git via `.git/info/exclude`).
   - The session was started after `.claude/agents/agent-team-*.md` existed (agent types load at session start;
     otherwise the workflow fails with "agent type 'agent-team-…' not found").
   - `gh auth status` lists the `project` scope (else `gh auth refresh -s project`), and
     `.claude/skills/agent-team/scripts/github-project.sh ensure` succeeds.
2. Run the Workflow tool with `scriptPath: .claude/workflows/agent-team.js` (or `name: "agent-team"`) and
   `args: { repo: "<absolute repo root, from git rev-parse --show-toplevel>" }` (required; the committed files hold no
   machine-specific paths). Optional extra `args`: `{ maxAgents, maxStepsPerTask, pollsPerWatch }`. GitHub events are only marked as seen
   when the PM acks them (`poll-github.sh ack <id>…`), so nothing is lost across crashes or relaunches.
3. All state is in memory files, so a fresh launch resumes: the first PM run sweeps the board and
   re-dispatches tasks that were mid-pipeline. Do not use resumeFromRunId for this workflow.

The run stops itself after ~900 agents (the per-run cap is 1000) or if the GitHub watcher fails 3 times;
relaunch then. Only one instance may run at a time (the poller cursor is shared).

## Checking state
Read `.agent-team/memory/product.md` (task index) and the task files, or `/workflows` for live progress.
