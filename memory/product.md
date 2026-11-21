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
All open tasks have their own issues (#11-#16, sub-issues of request #5) since 2026-11-20. 2026-11-20 sweep: the permission and infra-hold blockers are resolved by the setup change (pre-approved prod-deploy.sh, gh pr merge for deployment, drift rules). T-0001, T-0002 and T-0006 have shipped. T-0003 and T-0004 ship with T-0001's deploy of main. Only T-0005 waits on the human (design pick).

- T-0010 Visible focus on the file list after a dialog closes (issue #24, from T-0009 testing): engineering (dispatched 2026-11-21); T-0009 is on main and live.

### Shipped
- 2026-11-20 (prod at b8f2339): T-0009 Return focus after closing file and folder dialogs (#21, PR #23): Rename, Move and Add folder dialogs return focus to the opener (menu trigger or row) on Escape, Cancel or backdrop; after submit focus goes to the changed row or the file list.
- 2026-11-20 (prod at cd86cf4): T-0008 Desktop right-click menu takes keyboard focus (#20, PR #22): on desktop, a row menu opened by right-click, ContextMenu key or Shift+F10 focuses its first item, and Escape or a click outside returns focus to the row.
- 2026-11-20 (prod at aa66545): T-0007 Arrow-key navigation in dropdown menus (#18, PR #19): ArrowUp/Down with wrap-around and Home/End in the shared DropdownMenu, skipping disabled items and separators.
- 2026-11-20 (prod at 8ca7c03): T-0005 Make multi-select reachable on touch phones (#15, PR #17): on phone, Folder options has "Select items" to enter selection mode; the row `⋯` is gone and press-and-hold (or Shift+F10) opens the item menu.
- 2026-11-20 (prod at f52c859): T-0006 Visible keyboard focus ring on dockspace cards (#16, PR #10): 2px accent outline with offset on `:focus-visible` for workspace and create cards.
- 2026-11-20 (prod at 5569c71): T-0002 Show file sizes in folder listings (#12, PR #8): folder-children API returns file sizes, shown in current/ancestor columns, phone rows and the preview.
- 2026-11-20 (prod at 66c72ab): T-0001 File navigability (#11, PR #6), T-0003 Accessibility fixes on the files page (#13, PR #7), T-0004 Remaining axe findings (#14, PR #9). Also shipped the PR #1-#3 infra drift (image analysis removed, thumbnail Lambda without Docker, DistributionId output).

### Backlog (from TODO.md, no tasks yet)
- Dockspace types (Photos/Videos and Generic Files) with type-specific upload rules and UI; media dockspaces are folderless and use albums. Plan: plans/dockspace-types-and-media-album-plan.md (partly in place: the media page exists).
- Duplicate-upload handling: let the user skip files already stored.
- S3 bucket replication (CRR/SRR) for disaster recovery.

## Task index
| Task | Issue | Request | Title | Status | Owner |
|------|-------|---------|-------|--------|-------|
| T-0001 | #11 | #5 | File navigability: single folder view, parent context, side preview | done | Deployment |
| T-0002 | #12 | #5 | Show file sizes in folder listings (backend size field) | done | Deployment |
| T-0003 | #13 | #5 | Accessibility fixes on the dockspace files page | done | Deployment |
| T-0004 | #14 | #5 | Remaining axe findings: phone preview h1, dockspace list role | done | Deployment |
| T-0005 | #15 | #5 | Make multi-select reachable on touch phones | done | Engineering |
| T-0006 | #16 | #5 | Visible keyboard focus ring on dockspace cards | done | Deployment |
| T-0007 | #18 | #5 | Arrow-key navigation in dropdown menus | done | Engineering |
| T-0008 | #20 | #5 | Desktop right-click menu takes keyboard focus | done | Engineering |
| T-0009 | #21 | #5 | Return focus after closing file and folder dialogs | done | Engineering |
| T-0010 | #24 | #5 | Visible focus on the file list after a dialog closes | engineering | Engineering |
