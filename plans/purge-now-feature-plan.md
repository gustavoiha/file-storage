# Purge Now Feature Plan (High Level)

## Objective

Add a `Purge now` action on each item in the Trash screen so users can permanently purge a trashed file immediately, without waiting for trash retention.

## Product Behavior

1. In Trash page, each file row exposes a `Purge now` button/action.
2. Clicking `Purge now` opens a confirmation dialog.
3. If confirmed, the file is purged immediately.
4. On success:
   - item disappears from Trash,
   - item appears in Purged History.
5. On failure, user sees a clear error and the item remains in Trash.

## Semantics

- Purge is permanent.
- Purge must follow strict versioned semantics already adopted in the system:
  - `PURGED` means all S3 versions/delete markers for the key are removed.

## High-Level Implementation

### 1) Backend API: Add explicit purge-now endpoint

Add endpoint:
- `POST /dockspaces/{dockspaceId}/files/purge`

Request body:
- `fullPath: string` (trashed path)

Response:
- `fullPath`
- `state: 'PURGED'`
- `purgedAt`

### 2) Backend handler logic

New handler file:
- `/Users/gustavoiha/Personal/file-storage/packages/backend/src/handlers/purgeFileNow.ts`

Flow:
1. Validate/authenticate request.
2. Resolve trashed file by `fullPath` (using existing trashed lookup helpers).
3. Purge object from S3 using version-aware delete (`purgeObjectVersions`).
4. If versions remain, return conflict/error (do not mark metadata purged).
5. If fully removed, call `markFileNodePurged(...)`.
6. Return success payload.

Notes:
- Keep operation idempotent where practical.
- Reuse existing repository and S3 helper logic to avoid duplicate state transitions.

### 3) Infrastructure wiring

Update API/Lambda wiring in:
- `/Users/gustavoiha/Personal/file-storage/infra/cdk/src/stacks/backend-stack.ts`

Changes:
- register `purgeFileNow` handler in handlers map,
- grant table + bucket permissions,
- add `POST /dockspaces/{dockspaceId}/files/purge` route.

### 4) Frontend API + hook

Update:
- `/Users/gustavoiha/Personal/file-storage/apps/web/src/lib/dockspaceApi.ts`
- `/Users/gustavoiha/Personal/file-storage/apps/web/src/hooks/useFiles.ts`

Add:
- `purgeFileNow(dockspaceId, fullPath)` API function,
- `usePurgeFileNow(dockspaceId)` mutation hook.

On success invalidate:
- `trashQueryKey(...)`
- `purgedQueryKey(...)`

### 5) Trash UI changes

Update:
- `/Users/gustavoiha/Personal/file-storage/apps/web/src/pages/TrashPage.tsx`
- `/Users/gustavoiha/Personal/file-storage/apps/web/src/components/files/FileList.tsx`
- add new dialog component, e.g. `/Users/gustavoiha/Personal/file-storage/apps/web/src/components/files/ConfirmPurgeFileDialog.tsx`

UI requirements:
- Each trash row has `Restore` and `Purge now` actions.
- `Purge now` opens confirmation dialog with explicit irreversible warning.
- While pending, disable controls and show submitting label.

Implementation option:
- extend `FileList` flat mode with optional secondary item action,
- or render a Trash-specific list component if cleaner.

## Error Handling

- `404`: trashed file not found.
- `409`: could not fully purge versions / state conflict.
- generic `500`: unexpected backend failure.

Frontend should map these to user-readable messages in the dialog.

## Testing (High Level)

### Backend tests

1. Purge-now handler purges versions and marks metadata purged.
2. Handler does not mark purged when versions remain.
3. Handler returns not found for unknown/non-trashed file.

### Frontend tests

1. Trash page shows `Purge now` action for each item.
2. Clicking action opens confirmation dialog.
3. Confirm calls purge API and refreshes trash/purged lists.
4. Error states are shown and recoverable.

## Rollout Phases

1. Backend endpoint + route + tests.
2. Frontend API hook + dialog scaffolding.
3. Trash page action wiring + UX polish.
4. Regression pass for trash/restore/purged flows.

## Acceptance Criteria

- User can purge trashed files immediately from Trash page.
- Confirmation is required before purge.
- Successful purge bypasses retention delay and updates UI state promptly.
- Purge operation honors strict version-aware semantics (`PURGED` = all versions removed).
