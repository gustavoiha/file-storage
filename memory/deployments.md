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

### 2026-11-21 — T-0011 — web
- origin/main commit: `f0a598a` (PR #27 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #27 was MERGEABLE/CLEAN and already contained origin/main `9ac7afb` (merge commit on the branch), so the tested head is what landed. `prod-deploy.sh diff-pr 27` showed 0 stacks with differences. Main was `9ac7afb`, which prod already ran, so no drift.
- Infra: not run. PR #27 is web-only; `prod-deploy.sh diff` at `f0a598a` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-Dh9Ljnvn.js`, stylesheet `index-1OmrkbdH.css`.
- Shipped: #27 `f0a598a` (T-0011).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-Dh9Ljnvn.js`, renders the sign-in form, the served stylesheet contains `.dockspace-browser__sticky--empty`, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261121T171947Z.log, prod-deploy-web-20261121T172031Z.log, prod-deploy-diff-20261121T172043Z.log.
- Prod is now at origin/main `f0a598a` for both infra and web.

### 2026-11-21 — T-0012 — web
- origin/main commit: `c02881e` (PR #29 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #29 was MERGEABLE/CLEAN and already contained origin/main `f0a598a` (merge commit on the branch), so the tested head `0aff983` is what landed. `prod-deploy.sh diff-pr 29` showed 0 stacks with differences. Main was `f0a598a`, which prod already ran, so no drift.
- Infra: not run. PR #29 is web-only; `prod-deploy.sh diff` at `c02881e` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-BSsp0ftS.js`, files page chunk `DockspaceFilesPage-IalVSyLi.js`.
- Shipped: #29 `c02881e` (T-0012).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-BSsp0ftS.js`, renders the sign-in form, the new files page chunk is served (200), and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261121T173711Z.log, prod-deploy-diff-20261121T173739Z.log, prod-deploy-web-20261121T173830Z.log, prod-deploy-diff-20261121T173841Z.log.
- Prod is now at origin/main `c02881e` for both infra and web.

### 2026-11-21 — T-0014 — web
- origin/main commit: `8e15ec8` (PR #35 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #35 was MERGEABLE/CLEAN but branched from `f0a598a` (before T-0012). Merged locally onto origin/main `c02881e` it merged cleanly (disjoint files) and passed typecheck, tests (web 188, backend 165) and the build. `prod-deploy.sh diff-pr 35` showed 0 stacks with differences. Main was `c02881e`, which prod already ran, so no drift.
- Infra: not run. PR #35 is web-only; `prod-deploy.sh diff` at `8e15ec8` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-KxCj2tbC.js`, stylesheet `index-Dq7nbS38.css`, `FileList-I7RqSK61.js`.
- Shipped: #35 `8e15ec8` (T-0014).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-KxCj2tbC.js`, renders the sign-in form, the served stylesheet no longer contains `.dockspace-column__counts`, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261121T174741Z.log, prod-deploy-diff-20261121T174809Z.log, prod-deploy-web-20261121T174851Z.log, prod-deploy-diff-20261121T174903Z.log.
- Prod is now at origin/main `8e15ec8` for both infra and web.

### 2026-11-21 — T-0013 — web
- origin/main commit: `3361fc4` (PR #34 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #34 was MERGEABLE/CLEAN but branched from `f0a598a`. Merged locally onto origin/main `8e15ec8` (the tree testing used) it merged cleanly and passed typecheck, tests (web 195, backend 165) and the build. `prod-deploy.sh diff-pr 34` showed 0 stacks with differences. Main was `8e15ec8`, which prod already ran, so no drift.
- Infra: not run. PR #34 is web-only (CSS and a test); `prod-deploy.sh diff` at `3361fc4` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-bf7eOYj7.js`, stylesheet `index-BJ3qtDHN.css`.
- Shipped: #34 `3361fc4` (T-0013).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-bf7eOYj7.js`, renders the sign-in form, the served stylesheet contains `.resource-list__item:has(:focus-visible)` and the `@supports not selector(:has(*))` fallback, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261121T180553Z.log, prod-deploy-diff-20261121T180621Z.log, prod-deploy-web-20261121T180700Z.log, prod-deploy-diff-20261121T180714Z.log.
- Prod is now at origin/main `3361fc4` for both infra and web.

### 2026-11-21 — T-0017 — web
- origin/main commit: `ac36267` (PR #40 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #40 was MERGEABLE/CLEAN but branched from `8e15ec8` (before T-0013). Merged locally onto origin/main `3361fc4` it merged cleanly (different rules in `layout.css`) and passed typecheck, tests (web 200, backend 165) and the build. `prod-deploy.sh diff-pr 40` showed 0 stacks with differences. Main was `3361fc4`, which prod already ran, so no drift.
- Infra: not run. PR #40 is web-only (CSS and a style test); `prod-deploy.sh diff` at `ac36267` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-C2lxzaBK.js`, stylesheet `index-BDqNdBlA.css`.
- Shipped: #40 `ac36267` (T-0017).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-C2lxzaBK.js`, renders the sign-in form, the served stylesheet contains `.dockspace-column__row[aria-current]:focus-visible`, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261121T182042Z.log, prod-deploy-diff-20261121T182138Z.log, prod-deploy-web-20261121T182204Z.log.
- Prod is now at origin/main `ac36267` for both infra and web.

### 2026-11-21 — T-0018 — infra + web
- origin/main commit: `31619d2` (PR #41 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #41 was MERGEABLE/CLEAN but branched from `3361fc4` (before T-0017). Merged locally onto origin/main `ac36267` it merged cleanly (disjoint files) and passed typecheck, tests (web 204, backend 178) and the build. `prod-deploy.sh diff-pr 41` showed only DockspaceBackend Lambda code updates (`restoreFileFn`, `purgeFileNowFn`, `listTrashFn`), no replacements or stateful changes. API change is additive (optional `fileNodeId`). Main was `ac36267`, which prod already ran (`prod-deploy.sh diff` 0 stacks), so no drift.
- Infra (`prod-deploy.sh infra`): DockspaceBackend updated the three Lambdas; DockspaceIdentity, DockspaceStorage and DockspaceFrontendHosting unchanged.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-BWvQ2uNY.js`, `TrashPage-7FAjyFr6.js`, stylesheet `index-BDqNdBlA.css`.
- Shipped: #41 `31619d2` (T-0018).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-BWvQ2uNY.js`, renders the sign-in form, `TrashPage-7FAjyFr6.js` is served (200), and the console shows no errors. Post-deploy `prod-deploy.sh diff` shows 0 stacks with differences.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261121T182726Z.log, prod-deploy-diff-20261121T182835Z.log, prod-deploy-infra-20261121T182925Z.log, prod-deploy-web-20261121T183029Z.log, prod-deploy-diff-20261121T183040Z.log.
- Prod is now at origin/main `31619d2` for both infra and web.

### 2026-11-21 — T-0016 — web
- origin/main commit: `87a4c04` (PR #37 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #37 was MERGEABLE/CLEAN but did not contain `ac36267` (T-0017) and `31619d2` (T-0018). Merged locally onto origin/main `31619d2` it merged cleanly and passed typecheck, tests (web 209, backend 178) and the build. `prod-deploy.sh diff-pr 37` built its merge on a stale base (`3361fc4`), so it showed T-0018's three Lambdas (`restoreFileFn`, `purgeFileNowFn`, `listTrashFn`) as changed; PR #37 touches only `apps/web`. Main was `31619d2`, which prod already ran (`prod-deploy.sh diff` 0 stacks), so no drift.
- Infra: not run. PR #37 is web-only; `prod-deploy.sh diff` at `87a4c04` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-DzFzWiEJ.js`, files page chunk `DockspaceFilesPage-BZMtbb_L.js`.
- Shipped: #37 `87a4c04` (T-0016).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-DzFzWiEJ.js`, renders the sign-in form, `DockspaceFilesPage-BZMtbb_L.js` is served (200, JavaScript), and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261121T183246Z.log, prod-deploy-diff-20261121T183334Z.log, prod-deploy-web-20261121T183419Z.log, prod-deploy-diff-20261121T183429Z.log.
- Prod is now at origin/main `87a4c04` for both infra and web.
- Note: `diff-pr` may merge onto an older base than origin/main; confirm with `diff` before reading its stack changes as the PR's.

### 2026-11-21 — T-0019 — web
- origin/main commit: `9a46bcc` (PR #45 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #45 at `c2d29d5` was MERGEABLE/CLEAN and already contained origin/main `87a4c04`, so the merged tree is the one engineering and testing checked. Web only (`FileList.tsx`, `Button.tsx` forwardRef, `TrashPage.tsx`, `layout.css`, tests). `prod-deploy.sh diff-pr 45` showed 0 stacks with differences. Main was `87a4c04`, which prod already ran (`prod-deploy.sh diff` 0 stacks), so no drift.
- Infra: not run. Post-deploy `prod-deploy.sh diff` at `9a46bcc` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-B4pimDT9.js`, `TrashPage-CrYRMJJo.js`, `FileList-D9Bb6THx.js`, stylesheet `index-0veNX-bE.css`.
- Shipped: #45 `9a46bcc` (T-0019).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-B4pimDT9.js`, renders the sign-in form, `TrashPage-CrYRMJJo.js` is served (200, JavaScript), the `FileList` chunk contains `Dismiss error for`, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261121T190714Z.log, prod-deploy-diff-20261121T190746Z.log, prod-deploy-web-20261121T190838Z.log, prod-deploy-diff-20261121T190850Z.log.
- Prod is now at origin/main `9a46bcc` for both infra and web.

### 2026-11-21 — T-0020 — web
- origin/main commit: `674d6f4` (PR #44 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #44 at `a3e364d` was MERGEABLE/CLEAN but did not contain `9a46bcc` (T-0019). Merged locally onto origin/main `9a46bcc` it merged cleanly and passed typecheck, tests (web 235, backend 178) and the build. Web only (`ConfirmPurgeFileDialog.tsx`, `ConfirmFolderTrashDialog.tsx`, `useDialogDismiss.ts`, tests). `prod-deploy.sh diff-pr 44` showed 0 stacks with differences. Main was `9a46bcc`, which prod already ran (`prod-deploy.sh diff` 0 stacks), so no drift.
- Infra: not run. Post-deploy `prod-deploy.sh diff` at `674d6f4` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-BPT6BQD3.js`, `useDialogDismiss-StCBgzEp.js`, `TrashPage-D2xlTdeL.js`, `DockspaceFilesPage-BtjBii7l.js`, stylesheet `index-0veNX-bE.css`.
- Shipped: #44 `674d6f4` (T-0020).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-BPT6BQD3.js`, renders the sign-in form, `useDialogDismiss-StCBgzEp.js` is served (200, JavaScript), and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261121T191612Z.log, prod-deploy-diff-20261121T191640Z.log, prod-deploy-web-20261121T191728Z.log, prod-deploy-diff-20261121T191738Z.log.
- Prod is now at origin/main `674d6f4` for both infra and web.

### 2026-11-21 — T-0021 — web
- origin/main commit: `4a9ea0b` (PR #49 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #49 at `2061a3e` was MERGEABLE/CLEAN and already contained origin/main `674d6f4`, so the merged tree is the one engineering and testing checked. Web only (`FileList.tsx`, `TrashPage.tsx`, `layout.css`, tests). `prod-deploy.sh diff-pr 49` showed 0 stacks with differences. Main was `674d6f4`, which prod already ran (`prod-deploy.sh diff` 0 stacks), so no drift.
- Infra: not run. Post-deploy `prod-deploy.sh diff` at `4a9ea0b` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-C_AseQnz.js`, `TrashPage-CoGpjmmx.js`, `FileList-dTqeHLmI.js`, stylesheet `index-bfZV5UXs.css`.
- Shipped: #49 `4a9ea0b` (T-0021).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-C_AseQnz.js`, renders the sign-in form, `TrashPage-CoGpjmmx.js` is served (200, JavaScript), the `FileList` chunk contains `data-dialog-focus-fallback`, the stylesheet contains `.flat-file-list__empty:focus-visible`, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261121T193624Z.log, prod-deploy-diff-20261121T193652Z.log, prod-deploy-web-20261121T193735Z.log, prod-deploy-diff-20261121T193745Z.log.
- Prod is now at origin/main `4a9ea0b` for both infra and web.

### 2026-11-21 — T-0022 — web
- origin/main commit: `7803b6f` (PR #51 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #51 at `96fbf4d` was MERGEABLE/CLEAN but did not contain `4a9ea0b` (T-0021). Merged locally onto origin/main `4a9ea0b` it merged cleanly (`TrashPage.test.tsx` auto-merged) and passed typecheck, tests (web 273, backend 178) and the build. Web only (dialog components, `useDialogDismiss.ts`, `DockspaceMediaWorkspace.tsx`, tests). `prod-deploy.sh diff-pr 51` showed 0 stacks with differences. Main was `4a9ea0b`, which prod already ran (`prod-deploy.sh diff` 0 stacks), so no drift.
- Infra: not run. Post-deploy `prod-deploy.sh diff` at `7803b6f` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-BRjJGFT6.js`, `useDialogDismiss-CJGirHFX.js`, `TrashPage-BjfJCxAJ.js`, `DockspaceFilesPage-DzCLd3ne.js`, stylesheet `index-bfZV5UXs.css`.
- Shipped: #51 `7803b6f` (T-0022).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-BRjJGFT6.js`, renders the sign-in form, `useDialogDismiss-CJGirHFX.js` is served (200, JavaScript) and contains `data-row-path`, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261121T195719Z.log, prod-deploy-diff-20261121T195746Z.log, prod-deploy-web-20261121T195839Z.log, prod-deploy-diff-20261121T195850Z.log.
- Prod is now at origin/main `7803b6f` for both infra and web.

### 2026-11-21 — T-0015 — web
- origin/main commit: `133d212` (PR #47 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #47 at `68a1da3` was MERGEABLE/CLEAN but did not contain `7803b6f` (T-0022). Merged locally onto origin/main `7803b6f` it merged cleanly and passed typecheck, tests (web 308, backend 178) and the build; the squash-merged main tree is identical to that local merge. Web only (`FolderInfoPanel.tsx`, `detailPanelFocus.ts`, `FileList.tsx`, `DockspaceFilesHeaderActions.tsx`, `DockspaceFilesPage.tsx`, `layout.css`, tests). `prod-deploy.sh diff-pr 47` showed 0 stacks with differences. Main was `7803b6f`, which prod already ran (`prod-deploy.sh diff` 0 stacks), so no drift.
- Infra: not run. Post-deploy `prod-deploy.sh diff` at `133d212` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-B78-C1am.js`, `DockspaceFilesPage-Du_IIADG.js`, `FileList-o-Z7LlC4.js`, stylesheet `index-KpoBk-M8.css`.
- Shipped: #47 `133d212` (T-0015).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-B78-C1am.js`, renders the sign-in form, `DockspaceFilesPage-Du_IIADG.js` is served (200, JavaScript) and contains `Folder info` and `Counting contents`, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261121T200423Z.log, prod-deploy-diff-20261121T200451Z.log, prod-deploy-web-20261121T200538Z.log, prod-deploy-diff-20261121T200548Z.log.
- Prod is now at origin/main `133d212` for both infra and web.

### 2026-11-21 — T-0023 — web
- origin/main commit: `82d3ca4` (PR #53 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #53 at `112c7d7` was MERGEABLE/CLEAN but did not contain `7803b6f` (T-0022) and `133d212` (T-0015). Merged locally onto origin/main `133d212` it merged cleanly and passed typecheck, tests (web 312, backend 178) and the build; the squash-merged main tree is identical to that local merge. Web only (`FileList.tsx`, `TrashPage.tsx`, `TrashPage.test.tsx`). `prod-deploy.sh diff-pr 53` showed 0 stacks with differences. Main was `133d212`, which prod already ran (`prod-deploy.sh diff` 0 stacks), so no drift.
- Infra: not run. Post-deploy `prod-deploy.sh diff` at `82d3ca4` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-CEM7BWPB.js`, `TrashPage-QDrSaYij.js`, `FileList-CZ7pns4m.js`, stylesheet `index-KpoBk-M8.css`.
- Shipped: #53 `82d3ca4` (T-0023).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-CEM7BWPB.js`, renders the sign-in form, `TrashPage-QDrSaYij.js` (200, JavaScript) and `FileList-CZ7pns4m.js` (200) are served, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261121T200825Z.log, prod-deploy-diff-20261121T200852Z.log, prod-deploy-web-20261121T200949Z.log, prod-deploy-diff-20261121T201000Z.log.
- Prod is now at origin/main `82d3ca4` for both infra and web.

### 2026-11-21 — T-0024 — web
- origin/main commit: `acd41f7` (PR #55 squash-merged). Run as `dockspace-prod-agent-deployer` via `prod-deploy.sh`.
- Pre-deploy: PR #55 at `68ada3f` was MERGEABLE/CLEAN and already contained origin/main `e001c0e`, so the merged tree is the one engineering and testing checked (`git diff 68ada3f acd41f7` empty). Web only (`FileList.tsx`, `Alert.tsx`, `DockspaceFilesPage.tsx`, tests). `prod-deploy.sh diff-pr 55` showed 0 stacks with differences. Main since the last deploy (`82d3ca4`) only had `e001c0e` (#54, agent-team role docs, no app or infra change); `prod-deploy.sh diff` 0 stacks, so no drift.
- Infra: not run. Post-deploy `prod-deploy.sh diff` at `acd41f7` shows 0 stacks with differences.
- Web (`prod-deploy.sh web`): built and synced to the prod site bucket; invalidated `/*` on the prod distribution. Entry bundle `index-CFnqAWEd.js`, `DockspaceFilesPage-CETN01Kc.js`, `FileList-B_J1C6dq.js`, stylesheet `index-KpoBk-M8.css`.
- Shipped: #55 `acd41f7` (T-0024); #54 `e001c0e` (agent-team docs, nothing deployable).
- Smoke check: https://dh0djlfa46gz6.cloudfront.net/login serves `index-CFnqAWEd.js`, renders the sign-in form, `DockspaceFilesPage-CETN01Kc.js` is served (200, JavaScript) and contains `Try again`, and the console shows no errors.
- Logs: $LOCAL/logs/prod-deploy-diff-pr-20261121T211303Z.log, prod-deploy-diff-20261121T211330Z.log, prod-deploy-web-20261121T211426Z.log, prod-deploy-diff-20261121T211438Z.log.
- Prod is now at origin/main `acd41f7` for both infra and web.
