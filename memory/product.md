# Product state & roadmap (owned by Product Manager agent)

## Current product
Dockspace: a self-hosted, single-tenant cloud file storage app on AWS (minimal Google Drive). See repo README.md, TODO.md, plans/.
- Stack: React + TypeScript SPA (S3 + CloudFront), Cognito auth, API Gateway + Lambda, DynamoDB single table (one GSI), one versioned private S3 bucket per environment.
- Shipped: multiple dockspaces per user with featured metrics (file count, size, last upload); folder-based organization; sidebar folder tree with per-folder file counts; folder upload (nested) and S3 multipart for large files; move files (multi-select); rename and trash folders recursively; download file or folder; trash with a 30-day retention, "Purge now", and verified purge reconciliation through the GSI; S3 versioning; CORS limited to environment domains; media dockspace page (album-oriented).
- Environments: dev (dockspace-dev.officiarte.it), prod (dockspace.officiarte.it).

## Standing human decisions
- 2026-11-20 (https://github.com/gustavoiha/file-storage/issues/5#issuecomment-7037976159): the deployment agent may deploy to prod using the dedicated AWS profile `file-storage-prod-agent`.
- 2026-11-20 (https://github.com/gustavoiha/file-storage/issues/5#issuecomment-7037013124): the deployment agent may merge PRs to main and deploy to prod for this task and future tasks, but only when there are no breaking or irreversible database changes and no security or usability issues. Otherwise it must ask the human first. This is GitHub-level approval only and does not change local tool permission settings.

## Roadmap
### In progress / next
All open tasks have their own issues (#11-#16, sub-issues of request #5) since 2026-11-20. All six wait on the human (deploy permissions, infra hold decision, T-0005 design pick).

- T-0001 File navigability (issue #11, request #5): single folder view, parent-folder context, side preview panel. Human chose Option 1 (Miller columns); PR #6 merged to main (e031ebc). Prod web deploy blocked by the local permission guard; waiting on the human.

- T-0002 Show file sizes in folder listings (issue #12, follow-up from T-0001, needs backend). PR #8 ready; on hold: prod infra deploy would also delete the ImageAnalysis queues from PRs #1-#3, waiting on the human.
- T-0003 Accessibility fixes on the files page (issue #13; contrast, nested checkbox, h1; follow-up from T-0001). PR #7 merged to main (8a56afc); prod web deploy waiting on a local permission.
- T-0004 (issue #14) Remaining axe findings: phone preview h1 and dockspace list role (follow-up from T-0003). PR #9 merged to main (66c72ab); prod web deploy waiting on a local permission.
- T-0005 Make multi-select reachable on touch phones (issue #15, follow-up from T-0003). 3 design options posted; waiting on the human's pick.
- T-0006 Visible keyboard focus ring on dockspace cards (issue #16, follow-up from T-0004). PR #10 ready; merge blocked by local permissions, waiting on the human.

### Backlog (from TODO.md, no tasks yet)
- Dockspace types (Photos/Videos and Generic Files) with type-specific upload rules and UI; media dockspaces are folderless and use albums. Plan: plans/dockspace-types-and-media-album-plan.md (partly in place: the media page exists).
- Duplicate-upload handling: let the user skip files already stored.
- S3 bucket replication (CRR/SRR) for disaster recovery.

## Task index
| Task | Issue | Request | Title | Status | Owner |
|------|-------|---------|-------|--------|-------|
| T-0001 | #11 | #5 | File navigability: single folder view, parent context, side preview | awaiting-human | Deployment |
| T-0002 | #12 | #5 | Show file sizes in folder listings (backend size field) | awaiting-human | Engineering |
| T-0003 | #13 | #5 | Accessibility fixes on the dockspace files page | awaiting-human | Engineering |
| T-0004 | #14 | #5 | Remaining axe findings: phone preview h1, dockspace list role | awaiting-human | Engineering |
| T-0005 | #15 | #5 | Make multi-select reachable on touch phones | awaiting-human | Design |
| T-0006 | #16 | #5 | Visible keyboard focus ring on dockspace cards | awaiting-human | Engineering |
