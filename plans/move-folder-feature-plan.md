# Move Folder Feature Plan (High Level)

## Objective

Allow users to move a folder to another folder in `GENERIC_FILES` dockspaces, while preserving existing folder/file lifecycle behavior and avoiding invalid structures (for example cycles).

## User Experience

1. User opens folder row actions and clicks `Move`.
2. A move dialog opens with:
   - source folder path (read-only),
   - destination folder selector.
3. User confirms move.
4. UI refreshes directory and sidebar tree, showing folder at its new location.
5. Success and partial/no-op feedback is shown clearly.

MVP scope:
- Move a single folder per action.
- Keep folder name unchanged during move.

## Domain Rules

1. Root folder (`/`) cannot be moved.
2. Destination folder must exist.
3. Moving to the same parent is a no-op (`UNCHANGED`).
4. Destination cannot be the same folder or any descendant of source folder.
5. Destination cannot already contain a sibling folder with same normalized name (`CONFLICT`).

## Backend Plan

### API

- Add endpoint:
  - `POST /dockspaces/{dockspaceId}/folders/move`
- Request:
  - `sourceFolderPath: string`
  - `targetFolderPath: string`
- Response (proposed):
  - success:
    - `status: 'MOVED' | 'UNCHANGED'`
    - `from: string`
    - `to: string`
  - failures use HTTP status + error payload (`NOT_FOUND`, `CONFLICT`, `INVALID` semantics).

### Handler

- New handler:
  - `/Users/gustavoiha/Personal/file-storage/packages/backend/src/handlers/moveFolder.ts`
- Validate body, resolve source and destination.
- Enforce cycle and conflict checks.
- Delegate move operation to repository function.

### Repository

- Add repository primitive:
  - `moveFolderByPath(...)`
- Implementation strategy:
  - resolve source folder directory + node,
  - resolve destination folder node,
  - detect cycle by walking destination ancestry to root and checking source folder node id,
  - transactional write:
    - update source `FOLDER_NODE.parentFolderNodeId` (+ `updatedAt`),
    - delete old `DIRECTORY` record from old parent,
    - put new `DIRECTORY` record under destination parent.
- This is sufficient because descendants reference folder node ids, so moving ancestor folder does not require rewriting descendants.

### Infrastructure

- Wire lambda + route in:
  - `/Users/gustavoiha/Personal/file-storage/infra/cdk/src/stacks/backend-stack.ts`
- Grant table read/write to new handler.

## Frontend Plan

### API + Hooks

- Add client method in:
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/lib/dockspaceApi.ts`
  - `moveFolder(dockspaceId, sourceFolderPath, targetFolderPath)`
- Add mutation hook in:
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/hooks/useFiles.ts`
  - `useMoveFolder(dockspaceId)`

### UI

- Add `Move` action to folder row menu in:
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/components/files/FileList.tsx`
- Add dialog component (new or generalized existing move dialog):
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/components/files/MoveFolderDialog.tsx`
- Integrate in page:
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/pages/DockspaceFilesPage.tsx`

### State Handling Notes

- Invalidate files queries after success.
- Rebuild sidebar discovery map after move (recommended) to avoid stale cached folder paths.
- If moved folder is current folder or ancestor of current folder, recompute current `folderTrail` from new base path to avoid navigation inconsistency.
- Destination options should exclude source folder and known descendants for UX safety; backend remains source of truth.

## Error Handling

- `404` if source or destination is not found.
- `409` on destination name conflict.
- `400` for invalid requests (root move, move-into-self/descendant, malformed paths).
- UI should present explicit conflict/cycle errors and keep dialog open for retry.

## Delivery Phases

1. Backend repository primitive + handler + route.
2. Frontend API/hook integration.
3. Folder action menu + move dialog UX.
4. State refresh correctness (folder trail + sidebar map).
5. Tests and polish.

## Test Strategy

### Backend

1. Move folder success to different parent.
2. Move folder no-op when same parent.
3. Reject move of root folder.
4. Reject move into descendant (cycle prevention).
5. Reject destination conflict.
6. Reject missing source/destination.

### Frontend

1. Folder action menu shows `Move`.
2. Move dialog sends correct payload.
3. Error messages are shown for conflict/invalid moves.
4. After success, folder listing refreshes and dialog closes.
5. Current folder path updates correctly when moving current folder branch.

## Acceptance Criteria

- User can move a folder to another folder from the folder action menu.
- System prevents cycles and root-folder moves.
- Destination conflicts are reported clearly.
- Folder and file browsing remains consistent after move.
