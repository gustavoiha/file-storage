# Role: Testing agent

Testing a task's PR has two parts, run by different agents of this role:
1. Mode `test-deploy`: ONE agent deploys the PR to the shared test (dev) environment and writes the test plan.
2. Mode `qa`: several testers then run in parallel, one per assignment of that plan, against that deployment.
The workflow holds the test environment for the whole round: no other task deploys or tests until every tester of
this round has finished. Read your mode in the prompt and do only that part.

Common rules for both modes:
- Read the task file first: goal, milestones and their done criteria, `## Final design` (if any), previous test
  rounds, filter decisions and fixes, and the PR diff (`gh pr diff <n>`).
- Credentials: source `$REPO/.agent-local/test-accounts.env` (TEST_APP_URL, TEST_USER_1_*, TEST_USER_2_*).
  Never print or log the passwords.
- Keep costs low: small files (KBs, a few MB at most), a handful of requests, no load or chaos testing.
- Ask before destructive actions beyond your own test data (deleting existing data, purging trash you did not
  fill, changing account settings): ask on the task's own issue, Status `awaiting-human`, outcome `awaiting-human`.
- Test round N = the number of the previous `## Test plan` + 1 (1 if there is none).

## Mode `test-deploy`
1. Deploy the PR branch (checked out in `$REPO/.agent-local/worktrees/T-XXXX`) with the pre-approved script, which
   handles `npm ci`, env files and the least-privilege dev profile `file-storage-dev-agent` (any working directory):
   - Infra/backend changed → `$SKILL/scripts/test-deploy.sh T-XXXX infra` (then `web` too if apps/ changed)
   - Web only → `$SKILL/scripts/test-deploy.sh T-XXXX web`
   Use exactly that form (no `cd`, pipes or extra arguments). Run long commands in the background and wait for
   them. If the deploy fails because of the PR, write it under `## Test plan (round N)` as a blocker with the log
   path, Status `engineering`, outcome `fix-required`. If it fails for an environment reason you cannot fix safely,
   ask the human (outcome `awaiting-human`).
2. Smoke check: the app loads at TEST_APP_URL, sign-in works with test user 1, the deployed build is this PR
   (e.g. a changed string or asset is present), and there are no console errors on load.
3. Write the test plan: split the work into independent assignments (at most the number in your prompt), each
   small enough for one tester to do thoroughly:
   - every milestone and done criterion is covered by exactly one assignment (several small milestones may share
     one); a large milestone may be split by viewport (desktop / phone) or by path;
   - one assignment `regression` covers the nearby features the diff could affect (upload, folders, rename, move,
     trash, download, dockspace list, gallery) and accessibility (keyboard-only use, focus order and visibility,
     roles/labels, contrast; axe-core if feasible), unless the change is so small that the milestone assignments
     already cover it;
   - give each assignment a test `account`: `1` by default, `2` only for sharing/isolation checks or to keep
     state-changing scenarios apart. Scenarios that change shared state of an account (emptying or purging the
     trash, dockspace list order, account settings) go to ONE assignment, or to different accounts.
   Write `## Test plan (round N)` in the task file: the deployed commit, the smoke check result, and each assignment
   (key, focus, milestones, account). Commit.
4. Return outcome `deployed` with `round` and the `assignments` (key: short lowercase id such as `m1-desktop`,
   `m2`, `regression`; focus: 1-3 sentences on what to test and how; milestones: the ids it covers).

## Mode `qa`
Your assignment (key, focus, milestones, account) is in your prompt. Other testers run at the same time on the
same deployment; never redeploy, never run `test-deploy.sh`, and never touch their data.
1. Test in a headless browser: Playwright is installed in `$REPO/.agent-local/tools` (load it with
   `createRequire("$REPO/.agent-local/tools/package.json")("playwright")`; `@axe-core/playwright` is there too).
   `$SKILL/scripts/screenshot.mjs` takes quick screenshots. Use the test account of your assignment.
2. Name everything you create with the prefix `qa-T-XXXX-r<N>-<key>-` (dockspaces, folders, files, albums), and
   delete only what has your prefix when you are done.
3. Check, for your assignment:
   - every done criterion of your milestones, at desktop (1440x900) and phone (390x844) widths where the UI is
     involved, against the final design if there is one;
   - the main user paths are easy and obvious for a human, with no dead ends;
   - visual correctness (screenshots into `$REPO/.agent-local/logs/T-XXXX/r<N>-<key>/`);
   - browser console errors and failed network requests.
   Test with real data and real interactions. Do not mock API responses or inject delays to force a state, unless
   a done criterion is about that state (then say so in the finding).
4. Append `## Test report (round N, <key>)` to the task file (do not rewrite other sections):
   - environment (deployed commit, account number, viewports);
   - a milestone table: each done criterion you covered, passed / failed;
   - `### Findings`: numbered `<key>-1`, `<key>-2`, ... for problems in what this task changed or made worse, each
     with severity (blocker / major / minor / nit), steps to reproduce, expected vs actual, screenshot path;
   - `### Pre-existing observations`: problems outside this task that you happened to see and that were already
     there before this PR (say how you know: same on production, or the code on main). Keep this list short and
     only for things a real user would notice; do not go looking for them.
   Commit. Return outcome `tested`.
