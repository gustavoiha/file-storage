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
- Web (`prod-deploy.sh web`): built and synced to `dockspace-site-278820798556-eu-central-1-prod`; invalidated `/*` on E2H7JMCJNME3JF (I23O08ABLB31MBXHHHVGP70YJG). Entry bundle `index-jTdMD4Ks.js`.
- Shipped: #1 `b9445ba`, #2 `a9c79a3`, #3 `5678adc` (baseline drift); #6 `e031ebc` (T-0001); #7 `8a56afc` (T-0003); #9 `66c72ab` (T-0004).
- After the deploy, `prod-deploy.sh diff` shows 0 stacks with differences. Smoke check: the CloudFront domain serves the new build, `/login` renders the sign-in form, and the console shows no errors.
- Logs: /Users/gustavoiha/Personal/file-storage/.agent-local/logs/prod-deploy-infra-20261120T122653Z.log, prod-deploy-web-20261120T123105Z.log.
- Prod is now at origin/main `66c72ab` for both infra and web.

### 2026-11-20 — T-0002 — infra + web
- origin/main commit: `5569c71` (PR #8 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy `prod-deploy.sh diff` of `66c72ab`: 0 stacks with differences, so no drift was shipped.
- Infra (`prod-deploy.sh infra`): DockspaceBackend changed (new code for listFolderChildrenFn only). DockspaceIdentity, DockspaceStorage and DockspaceFrontendHosting had no changes.
- Web (`prod-deploy.sh web`): built and synced to `dockspace-site-278820798556-eu-central-1-prod`; invalidated `/*` on E2H7JMCJNME3JF (I6H2N5KD0ABVI0XAGBF3CNRWPA). Entry bundle `index-COV3TJUL.js`.
- Shipped: #8 `5569c71` (T-0002).
- After the deploy, `prod-deploy.sh diff` shows 0 stacks with differences. Smoke check: the CloudFront domain serves `index-COV3TJUL.js`, `/login` renders the sign-in form, and the console shows no errors.
- Logs: /Users/gustavoiha/Personal/file-storage/.agent-local/logs/prod-deploy-infra-20261120T123614Z.log, prod-deploy-web-20261120T123719Z.log.
- Prod is now at origin/main `5569c71` for both infra and web.

### 2026-11-20 — T-0006 — web
- origin/main commit: `f52c859` (PR #10 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: main was `5569c71`, the commit prod already ran, with 0 stacks with differences, so there was no drift to ship.
- Infra: not run. PR #10 is web-only (CSS and a test), and `prod-deploy.sh diff` at `f52c859` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to `dockspace-site-278820798556-eu-central-1-prod`; invalidated `/*` on E2H7JMCJNME3JF (IBLEQ8OMX4TAKB2H3A43N19ROY). Entry bundle `index-BJE4P2pX.js`, CSS `index-qpEa1GPr.css`, which contains the `.dockspace-card:focus-visible` outline rule.
- Shipped: #10 `f52c859` (T-0006).
- Smoke check: the CloudFront domain serves the new build, `/login` renders the sign-in form, and the console shows no errors.
- Logs: /Users/gustavoiha/Personal/file-storage/.agent-local/logs/prod-deploy-web-20261120T125228Z.log, prod-deploy-diff-20261120T125239Z.log.
- Prod is now at origin/main `f52c859` for both infra and web.

### 2026-11-20 — T-0005 — web
- origin/main commit: `8ca7c03` (PR #17 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: main was `f52c859`, the commit prod already ran; `prod-deploy.sh diff-pr 17` showed 0 stacks with differences, so there was no drift and no infra impact.
- Infra: not run. PR #17 is web-only; `prod-deploy.sh diff` at `8ca7c03` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to `dockspace-site-278820798556-eu-central-1-prod`; invalidated `/*` on E2H7JMCJNME3JF (I1TGBNQYSQKKFGM58WN2I8CFHR). Entry bundle `index-6fh0egiv.js`.
- Shipped: #17 `8ca7c03` (T-0005).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-6fh0egiv.js`, renders the sign-in form, and the console shows no errors.
- Logs: /Users/gustavoiha/Personal/file-storage/.agent-local/logs/prod-deploy-diff-pr-20261120T133324Z.log, prod-deploy-web-20261120T133421Z.log, prod-deploy-diff-20261120T133432Z.log.
- Prod is now at origin/main `8ca7c03` for both infra and web.
