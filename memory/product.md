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
- 2026-11-22: request #65 (gallery UI) split in two: T-0029 (#66) infinite scroll without jumps on phone and loading further ahead on desktop, in engineering; T-0030 (#67) gallery layout without the card frame, sidebar as a menu, gapless grid, in design (3 options for the human). T-0030 must keep T-0029's loading behaviour.
- 2026-11-22: T-0031 (#69) split from T-0029 review: show "Loading more media..." while a background refetch delays the next gallery page (small polish, new). Held until T-0029 (PR #68) is merged, since it builds on code and a test that exist only on that PR.
- 2026-11-22: T-0032 (#70) split from T-0029 test round 1: the gallery preview leaves focus on the page body when it closes (already on main); focus should return to the opening tile, or to the last shown item's tile. Held until T-0029 (PR #68) is merged.
- 2026-11-22: T-0029 is live, so T-0031 and T-0032 are dispatched to engineering. The human picked option 1 for T-0030 (album menu button, ⋯ Gallery options, floating uploads card); it goes to design-decision for the final spec, then engineering. All three touch the gallery files, so each rebases on main before its PR.
- 2026-11-22: T-0033 (#74) and T-0034 (#75) split from T-0031 test round 1, both already on main: an upload from the media gallery does not refresh the gallery (`useUploadFile` does not invalidate `media`), and the gallery Move to trash dialog stays on "Moving..." until the whole gallery refetch ends. Both dispatched to engineering on the next sweep; they touch `useFiles.ts` and the gallery files, so each rebases on main before its PR.
- 2026-11-22: T-0035 (#77) split from T-0032 test round 1, already on main: the gallery preview does not take focus when it opens and has no Tab trap, so Tab walks the hidden gallery first. Build after T-0032 (PR #72) is merged; it touches the gallery files, so rebase on main before its PR.
- 2026-11-22: T-0036 (#79) split from T-0033 test round 1: a tile uploaded from the gallery shows the placeholder until a reload, because the post-batch refetch runs before the thumbnail exists; add a bounded follow-up refresh. Build after T-0033 (PR #76) is merged; it touches the gallery files, so rebase on main before its PR.

### Shipped
- 2026-11-22 (prod at 9c3fc64): T-0032 Gallery preview returns focus to its tile on close (#70, PR #72): every close of the full-screen preview (Escape, Close preview, the empty area around the media) moves focus to the tile of the item shown last, scrolling a virtualized tile back into view first; fallbacks are the grid scroll box, then the Select multiple toggle, so focus never ends on the page body. The ring shows for keyboard closes only (`:focus-visible`).
- 2026-11-22 (prod at 3a8036d): T-0031 Gallery loading status while a background refetch delays the next page (#69, PR #71): when the user reaches the end of the loaded media while a background refetch holds the next page back, the reserved footer's `role="status"` shows "Loading more media..." (only within the load-ahead distance, so nothing is announced at the top of the gallery; not shown next to Try again or in album views).
- 2026-11-22 (prod at c5dfcdf): T-0029 Gallery infinite scroll: no jump on phone, load further ahead on desktop (#66, PR #68): the virtual grid's row stride now includes the CSS gap (the root cause of the jump), scroll anchoring is off on the grid, the loading text sits in a reserved footer, pages are 120 items, the next page is requested 2 viewport heights ahead plus 1.5 s at the current scroll speed (capped at 6), one request at a time, and a failed page shows Try again at the end of the grid instead of retrying in a loop.
- 2026-11-22 (prod at 1127709): T-0028 Show a load error on the dockspaces and usage pages when the dockspace list fails (#63, PR #64): with `GET /dockspaces` failing (non-403), `/dockspaces` shows "Couldn't load dockspaces." and the usage page "Couldn't load this dockspace's usage." with Try again (one request per press, focus kept), instead of an empty-looking list or "Dockspace not found.".
- 2026-11-22 (prod at 6211c82): T-0027 Stop the dockspace list request loop when it fails on the files page (#61, PR #62): with `GET /dockspaces` failing, a dockspace page now sends one request (plus normal retries) and shows "Couldn't load this dockspace." with Try again (one request per press) instead of looping about 850 requests a second behind an endless "Loading dockspace..."; on success the right page for the type shows.
- 2026-11-22 (prod at 97ce3a7): T-0026 Quick dockspace switcher, Slack-style (#58, PR #60): dockspace tabs in the top nav on every page inside a dockspace (files, media, trash, usage) with the current one marked, a "More (n)" popover with a filter when they do not fit, and "+" to create a dockspace; on phone, a bar under the top nav opens a full-screen dockspace list. Switching opens the other dockspace at its root in one action, with nothing carried over. The human calls it an experiment.
- 2026-11-22 (prod at 93aef8c): T-0025 Failed folder listing stays steady during uploads and folder creates (#56, PR #59): while the open folder's listing has failed, background refetches (after an upload, a folder create, discovery) keep the same error and Try again mounted, focus stays on Try again; a folder created or file uploaded into the failed folder no longer stays "Creating..." or vanishes: a status line says it was saved and will show after Try again (a count for several items). Try again, the empty state and T-0024 behaviour unchanged.
- 2026-11-21 (prod at acd41f7): T-0024 Failed folder listing shows the error without the empty state (#52, PR #55): when a folder's listing fails, the page shows only the error with Try again above the list (no "This folder is empty" / upload call to action, desktop and phone); Try again stays mounted and busy during the retry and focus goes to the folder's list after a successful retry; a pending create or upload row no longer hides the error. A truly empty folder still shows the empty state.
- 2026-11-21 (prod at 82d3ca4): T-0023 Trash page keeps focus on the row after a failed restore (#50, PR #53): after a failed inline Restore, focus that fell to the page goes back to that row's Restore button (visible ring for keyboard users); focus the user moved elsewhere is left alone; the per-row error, Dismiss and T-0021's focus after a successful restore are unchanged.
- 2026-11-21 (prod at 133d212): T-0015 Folder info panel from the folder action menu (#33, PR #47): "Info" first in every folder row menu and "Folder info" in Dockspace / Folder options open a panel in the file-preview slot (full page on phone) with subfolder and file counts (correct plurals), files size, created / modified dates and location; loading and error states with Try again; focus moves in on open and back to the opener on close.
- 2026-11-21 (prod at 7803b6f): T-0022 Confirmation dialogs keep focus after a failed purge or folder trash (#48, PR #51): after a failed purge or folder Move to Trash, focus moves to Cancel (visible ring for keyboard users); closing after a failed folder trash returns focus to the folder's Actions trigger or row; all dialog titles are `h2` (no axe `heading-order` violation).
- 2026-11-21 (prod at 4a9ea0b): T-0021 Keep focus in the trash list after a restore or purge (#46, PR #49): after a successful Restore, or a Purge confirmed in its dialog, focus moves to the next row's Restore button, else the previous row's, else the trash list or the empty-trash message (keyboard-only 2px accent ring). Never `body`.
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
| T-0015 | #33 | #31 | Folder info panel from the folder action menu | done | Design |
| T-0016 | #36 | #31 | Keep folder file counts current after moving files | done | Engineering |
| T-0017 | #38 | #5 | Visible keyboard focus on the current row in ancestor columns | done | Engineering |
| T-0018 | #39 | #5 | Trash page handles two trashed items with the same path separately | done | Review judge |
| T-0019 | #42 | #5 | Trash page restore errors name the item that failed | done | Review judge |
| T-0020 | #43 | #5 | Confirmation dialogs take focus when they open | done | Test filter |
| T-0021 | #46 | #5 | Keep focus in the trash list after a restore or purge | done | Test filter |
| T-0022 | #48 | #5 | Confirmation dialogs keep focus after a failed purge or folder trash | done | Engineering |
| T-0023 | #50 | #5 | Trash page keeps focus on the row after a failed restore | done | Engineering |
| T-0024 | #52 | #31 | Failed folder listing shows the error without the empty state | done | Engineering |
| T-0025 | #56 | #31 | Failed folder listing stays steady during uploads and folder creates | done | Test results filtering |
| T-0026 | #58 | #57 | Quick dockspace switcher panel (Slack-style) | done | Deployment |
| T-0027 | #61 | #57 | Stop the dockspace list request loop when it fails on the files page | done | Engineering |
| T-0028 | #63 | #57 | Show a load error on the dockspaces and usage pages when the dockspace list fails | done | Engineering |
| T-0029 | #66 | #65 | Gallery infinite scroll: no jump on phone, load further ahead on desktop | done | Engineering |
| T-0030 | #67 | #65 | Gallery layout: no card frame, actions in a menu, gapless grid | testing | Design |
| T-0031 | #69 | #65 | Gallery: show loading status while a background refetch delays the next page | done | Engineering |
| T-0032 | #70 | #65 | Gallery preview returns focus to its tile on close | done | Engineering |
| T-0033 | #74 | #65 | Gallery shows a file uploaded from the gallery without a reload | deploying | Engineering |
| T-0034 | #75 | #65 | Gallery Move to trash dialog closes without waiting for the gallery refetch | review | Engineering |
| T-0035 | #77 | #65 | Gallery preview takes focus when it opens and keeps Tab inside | new | Test results filtering |
| T-0036 | #79 | #65 | Gallery shows a new upload's thumbnail without a reload | new | Test results filtering |
