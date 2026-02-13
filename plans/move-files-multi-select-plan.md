# Move Files With Multi-Select Plan

## Goal

Add file-only move-to-folder support with multi-select in the file browser. Selection checkboxes should appear on hover, replacing the file/folder icon area.

## Scope

### In Scope (MVP)

- Multi-select UI for list items.
- Hover behavior: checkbox shown in icon slot.
- Selection toolbar actions for files.
- Move selected files to an existing target folder.
- File-only move support (folders cannot be selected for move).

### Out of Scope (MVP)

- Moving folders.
- Drag-and-drop moves.
- Cross-dockspace moves.
- Persistent selection across route changes.

## Current State

- `FileList` renders file/folder rows with icons and context menus.
- Backend has `moveOrRenameActiveFileNode` utility that can update parent folder and name.
- No public API endpoint currently exposes file move to another folder.

## UX Behavior

1. User hovers row icon area and sees selection checkbox.
2. User checks one or more files.
3. A selection action bar appears (`Move`, `Cancel`).
4. User clicks `Move`, chooses destination folder, confirms.
5. Selected files are moved; list refreshes and selection clears.

Notes:
- Folder rows can show checkbox UI for consistency but must not become movable in MVP.
- Move action is enabled only when at least one file is selected.

## Technical Design

### Frontend

1. Add selection state in page container
   - File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/pages/DockspaceFilesPage.tsx`
   - Maintain `selectedFilePaths: Set<string>`.
   - Provide handlers:
     - `toggleSelection(fullPath)`
     - `clearSelection()`
     - `selectAllVisibleFiles()`

2. Extend list component for selectable rows
   - File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/components/files/FileList.tsx`
   - Add props for selection mode:
     - `selectedFilePaths`
     - `onToggleFileSelection`
     - `isSelectionEnabled`
   - In file row:
     - render checkbox in the icon position on hover/focus/selected.
     - keep filename click behavior (open file) when not interacting with checkbox.
   - In folder row:
     - render visual checkbox placeholder on hover but disabled for move in MVP.

3. Add list and row styling for hover checkbox replacement
   - File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/styles/layout.css`
   - Add classes for checkbox container and selected-row emphasis.
   - Ensure keyboard focus visibility and mobile fallback (always visible in touch contexts if needed).

4. Add destination folder picker dialog
   - New file: `/Users/gustavoiha/Personal/file-storage/apps/web/src/components/files/MoveFilesDialog.tsx`
   - Inputs:
     - selected file count
     - destination folder path picker
   - Actions:
     - confirm move
     - cancel

5. Add API integration
   - File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/lib/dockspaceApi.ts`
   - Add `moveFiles(dockspaceId, sourcePaths, targetFolderPath)`.

6. Add mutation hook
   - File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/hooks/useFiles.ts`
   - Add `useMoveFiles`.
   - On success: invalidate affected file queries.

### Backend

1. Add move-files handler
   - New file: `/Users/gustavoiha/Personal/file-storage/packages/backend/src/handlers/moveFiles.ts`
   - Request body:
     - `sourcePaths: string[]`
     - `targetFolderPath: string`
   - Rules:
     - reject empty source list.
     - reject duplicate source paths.
     - reject if any source path is not active file.
     - reject folder sources in MVP.

2. Add repository operation
   - File: `/Users/gustavoiha/Personal/file-storage/packages/backend/src/lib/repository.ts`
   - Reuse `moveOrRenameActiveFileNode` for each source file with same `newName` and new parent folder node id.
   - Validate destination folder exists; return `404` if not found.
   - Conflict handling:
     - if destination contains same filename, return conflict for that file.
   - Start with sequential processing for predictable failure reporting.

3. Add route wiring in CDK
   - File: `/Users/gustavoiha/Personal/file-storage/infra/cdk/src/stacks/backend-stack.ts`
   - New route:
     - `POST /dockspaces/{dockspaceId}/files/move`

## API Contract Proposal

- Endpoint: `POST /dockspaces/{dockspaceId}/files/move`
- Request:
  - `sourcePaths: string[]`
  - `targetFolderPath: string`
- Response:
  - `moved: Array<{ from: string; to: string }>`
  - `failed: Array<{ from: string; error: string; code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID' }>`

Rationale:
- Supports partial success without forcing all-or-nothing transactions for MVP.

## Validation Rules

- Cannot move file to same folder (report as skipped/unchanged).
- Destination folder must exist.
- Duplicate source path in request should be rejected.
- Filename conflicts in destination should fail that item with explicit conflict.

## Testing Plan

### Frontend

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/tests/components/FileList.test.tsx`
1. Checkbox appears on hover/focus and toggles selection state.
2. Checkbox occupies icon slot when visible.
3. Selection bar appears when one or more files selected.

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/tests/pages/DockspaceFilesPage.test.tsx`
1. Move action enabled only for selected files.
2. Confirming move calls API with selected paths and destination.
3. Successful move clears selection and refreshes listing.

### Backend

- Files: `/Users/gustavoiha/Personal/file-storage/packages/backend/src/tests`
1. Moves active file to destination folder.
2. Returns per-item conflict when destination filename exists.
3. Rejects missing destination folder.
4. Rejects invalid/duplicate source path list.

## Delivery Phases

1. Phase 1: backend endpoint + repository wiring for file moves.
2. Phase 2: frontend multi-select state and hover checkbox UI.
3. Phase 3: move dialog and API mutation integration.
4. Phase 4: tests, polish, and accessibility verification.

## Acceptance Criteria

- User can select multiple files and move them to another existing folder.
- Selection checkbox appears in icon area on hover/focus.
- Only files are movable in this release.
- Conflicts and invalid moves are reported clearly without silent failures.
