# Production deployments ledger (owned by Deployment agent)

One entry per production deploy, newest last. Format:
`### <YYYY-MM-DD> — <task or "drift"> — <modes: infra / web>` then bullets: origin/main commit, stacks changed,
PRs/commits shipped (this task's and any drift), notes.

## Baseline (no agent deploy recorded yet)
Recorded 2026-11-20 by the setup session from a `cdk diff` of origin/main 5678adc against prod:
- Infra NOT yet deployed to prod (drift):
  - #1 `b9445ba` Remove image analysis feature: deletes the image-analysis Lambda (`analyzeImageFn`), its SQS
    queue + DLQ, SNS subscription, event source mapping and IAM role/policy in DockspaceBackend. All stateless.
  - #2 `a9c79a3` Bundle thumbnail Lambda without Docker: replaces `generateThumbnailFn` in DockspaceBackend.
  - #3 `5678adc` Attach web app domain and certificate to frontend distribution: only a new `DistributionId`
    stack output remained in DockspaceFrontendHosting (the rest appears to be live already).
- Merged after that diff, also not deployed: #6 `e031ebc` (T-0001, web), #7 `8a56afc` (T-0003, web),
  #9 `66c72ab` (T-0004, web/a11y). Check them with `prod-deploy.sh diff` and the PR file lists.
- Web app: last deployed commit unknown. Treat prod web as older than origin/main.
- DockspaceIdentity and DockspaceStorage had no differences.

### 2026-11-20 — T-0001 (with T-0003, T-0004 and baseline drift) — infra + web
- origin/main commit: `66c72ab`. Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Infra (`prod-deploy.sh infra`): DockspaceBackend changed (destroyed analyzeImageFn, its role, policy and event source mapping, ImageAnalysisJobsQueue, its DLQ, queue policy and SNS subscription; replaced generateThumbnailFn with a zip bundle on nodejs24.x). DockspaceFrontendHosting changed (new `DistributionId` output). DockspaceIdentity and DockspaceStorage had no changes.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-jTdMD4Ks.js`.
- Shipped: #1 `b9445ba`, #2 `a9c79a3`, #3 `5678adc` (baseline drift); #6 `e031ebc` (T-0001); #7 `8a56afc` (T-0003); #9 `66c72ab` (T-0004).
- After the deploy, `prod-deploy.sh diff` shows 0 stacks with differences. Smoke check: the CloudFront domain serves the new build, `/login` renders the sign-in form, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-infra-20261120T122653Z.log, prod-deploy-web-20261120T123105Z.log.
- Prod is now at origin/main `66c72ab` for both infra and web.

### 2026-11-20 — T-0002 — infra + web
- origin/main commit: `5569c71` (PR #8 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy `prod-deploy.sh diff` of `66c72ab`: 0 stacks with differences, so no drift was shipped.
- Infra (`prod-deploy.sh infra`): DockspaceBackend changed (new code for listFolderChildrenFn only). DockspaceIdentity, DockspaceStorage and DockspaceFrontendHosting had no changes.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-COV3TJUL.js`.
- Shipped: #8 `5569c71` (T-0002).
- After the deploy, `prod-deploy.sh diff` shows 0 stacks with differences. Smoke check: the CloudFront domain serves `index-COV3TJUL.js`, `/login` renders the sign-in form, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-infra-20261120T123614Z.log, prod-deploy-web-20261120T123719Z.log.
- Prod is now at origin/main `5569c71` for both infra and web.

### 2026-11-20 — T-0006 — web
- origin/main commit: `f52c859` (PR #10 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: main was `5569c71`, the commit prod already ran, with 0 stacks with differences, so there was no drift to ship.
- Infra: not run. PR #10 is web-only (CSS and a test), and `prod-deploy.sh diff` at `f52c859` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-BJE4P2pX.js`, CSS `index-qpEa1GPr.css`, which contains the `.dockspace-card:focus-visible` outline rule.
- Shipped: #10 `f52c859` (T-0006).
- Smoke check: the CloudFront domain serves the new build, `/login` renders the sign-in form, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-web-20261120T125228Z.log, prod-deploy-diff-20261120T125239Z.log.
- Prod is now at origin/main `f52c859` for both infra and web.

### 2026-11-20 — T-0005 — web
- origin/main commit: `8ca7c03` (PR #17 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: main was `f52c859`, the commit prod already ran; `prod-deploy.sh diff-pr 17` showed 0 stacks with differences, so there was no drift and no infra impact.
- Infra: not run. PR #17 is web-only; `prod-deploy.sh diff` at `8ca7c03` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-6fh0egiv.js`.
- Shipped: #17 `8ca7c03` (T-0005).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-6fh0egiv.js`, renders the sign-in form, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261120T133324Z.log, prod-deploy-web-20261120T133421Z.log, prod-deploy-diff-20261120T133432Z.log.
- Prod is now at origin/main `8ca7c03` for both infra and web.

### 2026-11-20 — T-0007 — web
- origin/main commit: `aa66545` (PR #19 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #19 branched before PR #17; merged locally with origin/main `8ca7c03` it passed typecheck, 152 web tests and the build. `prod-deploy.sh diff-pr 19` showed 0 stacks with differences. Main was `8ca7c03`, which prod already ran, so no drift.
- Infra: not run. PR #19 is web-only; `prod-deploy.sh diff` at `aa66545` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-Bzyj_-1v.js`.
- Shipped: #19 `aa66545` (T-0007).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-Bzyj_-1v.js`, renders the sign-in form, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261120T133751Z.log, prod-deploy-web-20261120T133850Z.log, prod-deploy-diff-20261120T133858Z.log.
- Prod is now at origin/main `aa66545` for both infra and web.

### 2026-11-20 — T-0008 — web
- origin/main commit: `cd86cf4` (PR #22 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #22 branched before `aa66545`; merged locally with origin/main it passed typecheck, 156 web tests and the build. `prod-deploy.sh diff-pr 22` showed 0 stacks with differences. Main was `aa66545`, which prod already ran, so no drift.
- Infra: not run. PR #22 is web-only; `prod-deploy.sh diff` at `cd86cf4` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-BLbVJzib.js`.
- Shipped: #22 `cd86cf4` (T-0008).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-BLbVJzib.js`, renders the sign-in form, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261120T134642Z.log, prod-deploy-web-20261120T134739Z.log, prod-deploy-diff-20261120T134749Z.log.
- Prod is now at origin/main `cd86cf4` for both infra and web.

### 2026-11-20 — T-0009 — web
- origin/main commit: `b8f2339` (PR #23 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #23 branched from `8ca7c03`; merged locally with origin/main `cd86cf4` it passed typecheck, 164 web tests and the build. `prod-deploy.sh diff-pr 23` showed 0 stacks with differences. Main was `cd86cf4`, which prod already ran, so no drift.
- Infra: not run. PR #23 is web-only; `prod-deploy.sh diff` at `b8f2339` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-48gw41bL.js`.
- Shipped: #23 `b8f2339` (T-0009).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-48gw41bL.js`, renders the sign-in form, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261120T135404Z.log, prod-deploy-web-20261120T135502Z.log, prod-deploy-diff-20261120T135512Z.log.
- Prod is now at origin/main `b8f2339` for both infra and web.

### 2026-11-21 — T-0010 — web
- origin/main commit: `9ac7afb` (PR #25 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #25 was MERGEABLE/CLEAN and merged cleanly onto origin/main `f93d5be`. Main had moved past the last deploy (`b8f2339`) only by `ac35d66` and `f93d5be` (human commits: agent-team tooling, README, TODO, plans; nothing under apps/, infra/ or packages/), so no deployable drift. `prod-deploy.sh diff-pr 25` and `prod-deploy.sh diff` at `f93d5be` both showed 0 stacks with differences.
- Infra: not run. PR #25 is web-only (CSS + tests); `prod-deploy.sh diff` at `9ac7afb` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-CCcoyxAu.js`, stylesheet `index-CM4E0DYg.css`.
- Shipped: #25 `9ac7afb` (T-0010).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-CCcoyxAu.js`, renders the sign-in form, the served stylesheet contains `.dockspace-browser__list:focus-visible`, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261121T170429Z.log, prod-deploy-diff-20261121T170500Z.log, prod-deploy-web-20261121T170559Z.log, prod-deploy-diff-20261121T170613Z.log.
- Prod is now at origin/main `9ac7afb` for both infra and web.
- Housekeeping: removed bucket names, account IDs, distribution/invalidation IDs and absolute paths from earlier entries (the ledger is public).
