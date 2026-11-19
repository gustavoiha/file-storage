# Product state & roadmap (owned by Product Manager agent)

## Current product
Dockspace: a self-hosted, single-tenant cloud file storage app on AWS (minimal Google Drive). See repo README.md, TODO.md, plans/.
- Stack: React + TypeScript SPA (S3 + CloudFront), Cognito auth, API Gateway + Lambda, DynamoDB single table (one GSI), one versioned private S3 bucket per environment.
- Shipped: multiple dockspaces per user with featured metrics (file count, size, last upload); folder-based organization; sidebar folder tree with per-folder file counts; folder upload (nested) and S3 multipart for large files; move files (multi-select); rename and trash folders recursively; download file or folder; trash with a 30-day retention, "Purge now", and verified purge reconciliation through the GSI; S3 versioning; CORS limited to environment domains; media dockspace page (album-oriented).
- Environments: dev (dockspace-dev.officiarte.it), prod (dockspace.officiarte.it).

## Roadmap
### In progress / next
- T-0001 File navigability (issue #5): single folder view, parent-folder context, side preview panel. Human chose Option 1 (Miller columns); PR #6 open, back in engineering after test round 1 (2 critical fixes).

- T-0002 Show file sizes in folder listings (follow-up from T-0001, needs backend). Blocked by T-0001: dispatch after PR #6 merges.
- T-0003 Accessibility fixes on the files page (contrast, nested checkbox, h1; follow-up from T-0001). Blocked by T-0001: dispatch after PR #6 merges.

### Backlog (from TODO.md, no tasks yet)
- Dockspace types (Photos/Videos and Generic Files) with type-specific upload rules and UI; media dockspaces are folderless and use albums. Plan: plans/dockspace-types-and-media-album-plan.md (partly in place: the media page exists).
- Duplicate-upload handling: let the user skip files already stored.
- S3 bucket replication (CRR/SRR) for disaster recovery.

## Task index
| Task | Issue | Title | Status | Owner |
|------|-------|-------|--------|-------|
| T-0001 | #5 | File navigability: single folder view, parent context, side preview | awaiting-human | Engineering |
| T-0002 | #5 | Show file sizes in folder listings (backend size field) | new | - |
| T-0003 | #5 | Accessibility fixes on the dockspace files page | new | - |
