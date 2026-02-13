# Recursive Folder Trash Plan

## Goal

Allow users to trash an entire folder and all of its descendants (files and subfolders) in one action.

## Current State

- File trashing exists via `POST /dockspaces/{dockspaceId}/files/trash` for a single file path.
- Folder list actions currently support rename but not trash.
- Folder tree data is available from `listFolderChildren` by `parentFolderNodeId`.

## Scope

### In Scope (MVP)

- Add `Trash folder` action for folders in the file browser.
- Confirm destructive action before execution.
- Recursively traverse selected folder subtree and trash all files.
- Reflect operation status in UI (running/success/partial failure).

### Out of Scope (MVP)

- Server-side single-call recursive folder trash endpoint.
- Undo/restore-all flow for a whole folder.
- Background job processing for very large folder trees.

## UX Behavior

1. User opens folder actions menu and selects `Trash folder`.
2. Confirmation dialog shows:
   - folder name/path,
   - warning that all nested files will be moved to trash.
3. After confirm, UI shows progress state (for example: `Trashing 8/42 files...`).
4. On completion:
   - success: close dialog and refresh file/trash views.
   - partial failure: show count and error details, with retry option for failed files.

## Implementation Plan

### 1) Add folder trash action in file browser

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/components/files/FileList.tsx`
- Add `Trash folder` menu item in folder row actions.
- Wire callback `onTrashFolder(folderPath: string)`.

### 2) Add confirmation dialog for folder trash

- New file: `/Users/gustavoiha/Personal/file-storage/apps/web/src/components/files/TrashFolderDialog.tsx`
- Dialog states:
  - idle confirmation,
  - running/progress,
  - completion summary (success or partial failure).

### 3) Build recursive traversal on client

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/pages/DockspaceFilesPage.tsx`
- Add recursive collector:
  - start from target folder node id,
  - call `listFolderChildren` for each folder node,
  - collect all descendant file full paths,
  - traverse subfolders depth-first or breadth-first.
- Then call existing file trash mutation/API for each collected file path.

### 4) Add dedicated hook for recursive folder trash workflow

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/hooks/useFiles.ts`
- Add `useTrashFolderRecursively` (or equivalent helper) to:
  - run traversal + trash pipeline,
  - expose progress metrics,
  - aggregate failures without aborting entire run.

### 5) Cache and refresh strategy

- Invalidate affected `files` and `trash` query keys after completion.
- Prefer batched invalidation at end of operation instead of per-file full refetch.

## Recursive Algorithm (MVP)

1. Resolve `folderNodeId` for target folder from current folder data/trail mapping.
2. Queue target folder node id.
3. While queue not empty:
   - fetch children for current folder node,
   - append file paths for file children,
   - enqueue folder children node ids.
4. Execute file-trash calls with bounded concurrency (for example `3`).
5. Track progress:
   - `totalFiles`,
   - `processedFiles`,
   - `failedFiles`.

## Error Handling

- If child listing fails for a folder, mark that subtree as failed and continue when possible.
- If individual file trash fails, continue remaining files and include per-file errors in summary.
- If no files are found under folder:
  - allow removing empty folder node in a follow-up feature, or
  - show `Folder is empty; no files moved` in MVP.

## Validation Rules

- Root folder trash action is disabled.
- Only active files are sent to trash endpoint.
- Duplicate paths in collected result are de-duplicated before trash calls.

## Testing Plan

### Frontend component tests

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/tests/components/FileList.test.tsx`
1. Folder menu includes `Trash folder`.
2. Selecting `Trash folder` calls callback with correct folder path.

### Frontend page/hook tests

- Files:
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/tests/pages/DockspaceFilesPage.test.tsx`
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/tests/hooks/useFiles.test.tsx`
1. Recursive traversal collects nested files across multiple folder levels.
2. Progress updates during operation.
3. Partial failures are surfaced without dropping successful moves to trash.
4. Completion invalidates file and trash queries.

### Manual validation

1. Trash a folder with 2+ nested levels and verify files appear in Trash view.
2. Simulate one failing file and verify partial failure summary + retry path.
3. Confirm root folder cannot be trashed.

## Delivery Phases

1. Phase 1: folder action + confirmation dialog scaffolding.
2. Phase 2: recursive traversal + bounded-concurrency file trash pipeline.
3. Phase 3: progress UI + partial failure reporting.
4. Phase 4: tests and manual validation.

## Acceptance Criteria

- User can trash a non-root folder recursively from a single action.
- All descendant files are attempted; failures are reported clearly.
- UI provides progress and final summary.
- File and trash listings reflect final state after operation.
