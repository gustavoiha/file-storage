# Move Files With Multi-Select Plan (High Level)

## Objective

Implement file-only move-to-folder in the dockspace browser with multi-select support and hover checkboxes that replace row icons while selection mode is active.

## User Experience

1. User hovers a file row and sees a checkbox in the icon slot.
2. User selects one or more files.
3. A selection action bar appears with `Move` and `Cancel`.
4. User chooses destination folder and confirms.
5. UI shows completion summary and refreshes folder contents.

MVP constraints:
- Move only files (not folders).
- Keep existing single-file actions (rename, trash, open) intact.

## High-Level Implementation

### Frontend

- Add selection state in the dockspace files page:
  - selected file paths
  - select/unselect handlers
  - clear selection on cancel/success/navigation changes where appropriate
- Update file list rows to support selection mode:
  - checkbox replaces icon on hover/focus/selected state
  - row remains keyboard accessible
- Add move dialog:
  - shows selected file count
  - allows choosing an existing destination folder
  - confirms move action
- Add a `moveFiles` API client function and mutation hook.
- Refresh files-related queries after move completion and clear selection.

Primary files:
- `/Users/gustavoiha/Personal/file-storage/apps/web/src/pages/DockspaceFilesPage.tsx`
- `/Users/gustavoiha/Personal/file-storage/apps/web/src/components/files/FileList.tsx`
- `/Users/gustavoiha/Personal/file-storage/apps/web/src/components/files/MoveFilesDialog.tsx` (new)
- `/Users/gustavoiha/Personal/file-storage/apps/web/src/lib/dockspaceApi.ts`
- `/Users/gustavoiha/Personal/file-storage/apps/web/src/hooks/useFiles.ts`
- `/Users/gustavoiha/Personal/file-storage/apps/web/src/styles/layout.css`

### Backend

- Add a move endpoint for batch file moves.
- Validate request:
  - non-empty source list
  - unique source paths
  - destination folder exists
  - sources are active files
- Reuse existing repository move/rename primitive to move each file to new parent folder.
- Return per-file results to support partial success handling.

Primary files:
- `/Users/gustavoiha/Personal/file-storage/packages/backend/src/handlers/moveFiles.ts` (new)
- `/Users/gustavoiha/Personal/file-storage/packages/backend/src/lib/repository.ts`
- `/Users/gustavoiha/Personal/file-storage/infra/cdk/src/stacks/backend-stack.ts`

## API Shape (Proposed)

- `POST /dockspaces/{dockspaceId}/files/move`
- Request:
  - `sourcePaths: string[]`
  - `targetFolderPath: string`
- Response:
  - `moved: Array<{ from: string; to: string }>`
  - `failed: Array<{ from: string; code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID'; error: string }>`

## Error/Conflict Behavior

- Destination filename conflicts should fail that file with `CONFLICT`.
- Missing files or invalid paths should return per-file failure entries.
- Moving to the same folder can be treated as skipped/no-op.
- UI should surface partial success clearly (`X moved, Y failed`).

## Delivery Phases

1. Backend endpoint and repository integration.
2. Frontend selection mode and hover-checkbox behavior.
3. Move dialog + mutation wiring + result handling.
4. Test coverage and accessibility polish.

## Test Strategy (High Level)

- Frontend component tests:
  - checkbox visibility/toggle behavior
  - selection action bar behavior
- Frontend page tests:
  - move request payload from selected files
  - selection clears on success
- Backend tests:
  - destination conflict handling
  - invalid request validation
  - partial success responses

## Acceptance Criteria

- User can multi-select files and move them to another folder.
- Hover checkbox replaces row icon in selection interaction.
- Only files are moveable in this feature.
- Conflicts and failures are reported without hiding successful moves.
