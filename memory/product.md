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

- T-0015 Folder info panel from the folder action menu (issue #33, request #31): human picked option 2 (info in the right-hand file-preview panel) on 2026-11-21; test round 1 found the discovery request loop on failed listings, back in engineering.
- T-0021 Keep focus in the trash list after a restore or purge (issue #46, request #5, from T-0019 test round 1, finding 2): after a successful restore or purge on the trash page focus falls to body; move it to the next/previous row like T-0012. Tested and passed; deploying (PR #49).
- T-0022 Confirmation dialogs keep focus after a failed purge or folder trash (issue #48, request #5, from T-0020 test round 1, findings 1-3): after a failed purge or folder trash focus goes to Cancel, a failed folder trash returns focus to the opener on close, and dialog titles stop skipping heading levels. In engineering since 2026-11-21 (T-0020, PR #44, merged and live).
- T-0023 Trash page keeps focus on the row after a failed restore (issue #50, request #5, from T-0021 test round 1, finding 1): after a failed inline Restore focus falls to body because the button is disabled during the request; put it back on the row's Restore (or Dismiss). New; builds on T-0021 (PR #49), so dispatch after it is merged.

### Shipped
- 2026-11-21 (prod at 674d6f4): T-0020 Confirmation dialogs take focus when they open (#43, PR #44): the Purge and folder Move to Trash dialogs focus Cancel on open (Enter right away closes without deleting); Tab and Shift+Tab stay inside the dialog through a document-level trap, also while submitting and after a failed submit; Escape, Cancel and backdrop still return focus to the opener.
- 2026-11-21 (prod at 9a46bcc): T-0019 Trash page restore errors name the item that failed (#42, PR #45): restore errors are kept per trashed copy and shown in that row (`Could not restore <path> (trashed <date, time>): <error>`), scroll into view, survive other rows' restores, and clear on retry, when the copy leaves the trash, or on Dismiss (focus returns to the row's Restore button).
- 2026-11-21 (prod at 87a4c04): T-0016 Keep folder file counts current after moving files (#36, PR #37): after a move (also a partly failed one) the target and source folder counts in the folder rows and the sidebar tree update from the move response without a reload or a full tree re-discovery; the open folder is recounted from its refetched listing only, so it is not counted twice.
- 2026-11-21 (prod at 31619d2): T-0018 Trash page handles two trashed items with the same path separately (#39, PR #41): list trash returns each item's `fileNodeId`; purge and restore take it and act only on that trashed copy (path-only requests with several matches get a 409, no change); trash rows show the trashed date and time, pending labels and keys are per item, the Purge dialog names the copy, closes on success and shows the error on failure; restore errors are shown.
- 2026-11-21 (prod at ac36267): T-0017 Visible keyboard focus on the current row in ancestor columns (#38, PR #40): the current (`aria-current`) row in a desktop ancestor column shows a 2px accent outline (inset) on `:focus-visible`, on top of its fill and accent left bar; no ring after a mouse click.
- 2026-11-21 (prod at 3361fc4): T-0013 Show the row focus highlight only after keyboard use (#30, PR #34): file list rows show the inset ring and accent bottom border only for keyboard focus (`:has(:focus-visible)`), not after mouse or touch actions that move focus; browsers without `:has()` keep the `:focus-within` highlight.
- 2026-11-21 (prod at 8e15ec8): T-0014 Remove the folder and file counts from the current folder heading (#32, PR #35): the desktop current column heading shows only the folder name (root label at the root); counts move to the folder info panel (T-0015).
- 2026-11-21 (prod at c02881e): T-0012 Keep focus in the file list after a file is moved to the trash (#28, PR #29): after Move to Trash on a file from any row menu, focus goes to the next row, else the previous row, else the file list fallback; on a failed trash it returns to the menu trigger or the row. Never `body`.
- 2026-11-21 (prod at f0a598a): T-0011 Status line confirms Move to Trash (#26, PR #27): folder and file Move to Trash clear the old move message and show "Folder moved to trash." / "File moved to trash." ("Failed to move file to trash." on a failed file trash); the `role="status"` region stays mounted so the confirmation is announced.
- 2026-11-21 (prod at 9ac7afb): T-0010 Visible focus on the file list after a dialog closes (#24, PR #25): the file list fallback shows the 2px accent ring on `:focus-visible` after Move to Trash or a move out of the current folder; no ring for mouse users.
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
| T-0010 | #24 | #5 | Visible focus on the file list after a dialog closes | done | Deployment |
| T-0011 | #26 | #5 | Status line confirms Move to Trash and drops stale messages | done | Deployment |
| T-0012 | #28 | #5 | Keep focus in the file list after a file is moved to the trash | done | Deployment |
| T-0013 | #30 | #5 | Show the row focus highlight only after keyboard use | done | Review judge |
| T-0014 | #32 | #31 | Remove the folder and file counts from the current folder heading | done | Deployment |
| T-0015 | #33 | #31 | Folder info panel from the folder action menu | engineering | Design |
| T-0016 | #36 | #31 | Keep folder file counts current after moving files | done | Engineering |
| T-0017 | #38 | #5 | Visible keyboard focus on the current row in ancestor columns | done | Engineering |
| T-0018 | #39 | #5 | Trash page handles two trashed items with the same path separately | done | Review judge |
| T-0019 | #42 | #5 | Trash page restore errors name the item that failed | done | Review judge |
| T-0020 | #43 | #5 | Confirmation dialogs take focus when they open | done | Test filter |
| T-0021 | #46 | #5 | Keep focus in the trash list after a restore or purge | deploying | Test filter |
| T-0022 | #48 | #5 | Confirmation dialogs keep focus after a failed purge or folder trash | engineering | Engineering |
| T-0023 | #50 | #5 | Trash page keeps focus on the row after a failed restore | new | Test filter |
