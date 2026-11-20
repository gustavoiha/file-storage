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
