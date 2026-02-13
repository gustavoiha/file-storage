# Folder Upload Feature Plan

## Goal

Add support for uploading an entire local folder (with nested subfolders) from the Dockspace Files page into the currently opened dockspace folder, while preserving relative paths.

## Current State Summary

- The frontend currently stages files via `useDockspaceUploadDialog` and uploads each item with `uploadFile({ fullPath, file })`.
- The hidden input in `DockspaceFilesHeaderActions` supports only `multiple` file selection.
- Backend upload uses existing endpoints:
  - `POST /dockspaces/{dockspaceId}/files/upload-session`
  - `POST /dockspaces/{dockspaceId}/files/confirm-upload`
- `upsertActiveFileByPath` already ensures folder nodes exist for nested paths before writing file metadata, so folder creation can happen implicitly during upload.

## Scope

### In Scope (MVP)

- New UI action: "Upload folder".
- Local folder selection through browser directory input.
- Preserve nested relative paths under the current dockspace folder.
- Stage all selected files in the upload dialog.
- Upload files with controlled concurrency and per-file status.
- Final summary: uploaded count, failed count, skipped count.

### Out of Scope (MVP)

- Drag-and-drop folder upload.
- Pause/resume uploads after page refresh.
- Multipart upload optimization for very large files.
- Backend bulk upload APIs.

## UX and Behavior

1. User opens dockspace folder, clicks menu, selects `Upload folder`.
2. Browser file picker opens in directory mode.
3. After selection, files are staged with inferred relative paths from `webkitRelativePath`.
4. Dialog shows:
   - filename
   - relative path destination
   - status (`pending`, `uploading`, `success`, `error`, `skipped`)
5. On submit:
   - files upload with limited concurrency (e.g., 3 at a time),
   - upload continues even if some files fail.
6. Dialog remains open with summary; user can close or retry failed files.

## Technical Design

### Frontend Changes

1. `apps/web/src/components/files/DockspaceFilesHeaderActions.tsx`
   - Add a second hidden `<input type="file">` for directory upload.
   - Use `multiple` + `webkitdirectory` (and `directory` attribute for compatibility intent).
   - Add `Upload folder` menu action wired to the new input.

2. `apps/web/src/pages/DockspaceFilesPage.tsx`
   - Add handler for folder selection (`onUploadFolderSelection`).
   - Pass the selected files to upload dialog in "folder mode".
   - Keep existing file upload flow unchanged.

3. `apps/web/src/hooks/useDockspaceUploadDialog.ts`
   - Extend staged model with:
     - `relativePath`
     - `targetFullPath`
     - `status`
     - `errorMessage`
   - Add folder-staging method that:
     - reads `file.webkitRelativePath`,
     - strips the top-level folder name,
     - builds target path under `currentFolderPath`.
   - Validate and de-duplicate target paths.
   - Implement concurrent upload runner with bounded parallelism.
   - Return aggregate result counts for summary UI.

4. `apps/web/src/components/files/UploadStagingList.tsx`
   - Show per-item relative destination and status.
   - Disable filename editing for folder-mode items in MVP (to avoid path mismatch complexity).

5. `apps/web/src/components/files/UploadFilesDialog.tsx`
   - Add summary banner after upload attempt.
   - Add `Retry failed` action.

6. Path helpers (`apps/web/src/components/files/pathHelpers.ts`)
   - Add helper to normalize relative folder paths from browser input.
   - Ensure both `/` and `\` are normalized.
   - Keep existing `buildPathInFolder` behavior for single-file uploads.

### Backend Changes

No required API contract changes for MVP.

Reason:
- Existing single-file upload session + confirm flow is already path-based.
- Existing repository logic creates missing folder nodes from path segments.

Optional future enhancement:
- Add bulk upload session endpoint to reduce round trips for very large folder uploads.

## Edge Cases and Validation Rules

- Empty folder selection (zero files): show validation message, do not open submit flow.
- Duplicate target paths in one selection: keep first entry, mark others as skipped with reason.
- Target path collision with existing file: allow overwrite behavior (same as current upload flow).
- Invalid path segments (`.`/`..`, empty names, slash-only): skip with explicit reason.
- Partial failure in batch: keep successful uploads committed and report failed subset.

## Testing Plan

### Unit Tests

1. `useDockspaceUploadDialog`:
   - stages folder selections from `webkitRelativePath`,
   - strips top-level folder correctly,
   - computes target paths under nested current folder,
   - handles duplicates and invalid paths,
   - uploads with bounded concurrency,
   - retries only failed files.

2. Path helper tests:
   - mixed slash normalization (`\` vs `/`),
   - empty and malformed relative paths.

### Component Tests

1. `DockspaceFilesHeaderActions`:
   - renders and triggers `Upload folder` action.
2. `UploadStagingList`:
   - renders per-file status and relative paths.
3. `UploadFilesDialog`:
   - renders summary and retry action after mixed result uploads.

### Integration/Manual Validation

1. Upload folder with two nested levels and verify listing structure.
2. Upload folder where one file intentionally fails and verify partial success behavior.
3. Re-upload same folder and verify overwrite behavior remains consistent.

## Performance and Limits

- Start with default concurrency `3` to avoid browser/network overload.
- For very large selections (>1000 files), stage incrementally and render with lightweight list updates to keep UI responsive.
- Consider virtualized staging list in follow-up if file counts make rendering expensive.

## Delivery Phases

1. Phase 1: Add folder selection entry point + staging model changes.
2. Phase 2: Implement upload runner with per-file status and summary.
3. Phase 3: Add retry-failed behavior.
4. Phase 4: Add comprehensive tests and manual verification pass.

## Acceptance Criteria

- User can choose `Upload folder` and select a local directory.
- Nested structure is preserved under current dockspace folder.
- Upload dialog shows per-file status and final summary.
- A failed subset does not block successful files.
- Existing single-file upload behavior and tests remain green.
