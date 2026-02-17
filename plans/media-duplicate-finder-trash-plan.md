# Media Duplicate Finder and Trash Plan

## Goal

Allow users in a `PHOTOS_VIDEOS` dockspace to:
- find all duplicate media files in the dockspace using `contentHash`,
- review each duplicate group,
- move repeated items to Trash while keeping one chosen item per group.

## Current State

- Media listing already returns `contentHash` for active media:
  - `/Users/gustavoiha/Personal/file-storage/packages/backend/src/handlers/listMedia.ts`
- Media workspace already supports per-item `Move to trash`:
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/pages/DockspaceMediaPage.tsx`
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/hooks/useFiles.ts`
- Trash flow already removes media from album memberships when trashed:
  - `/Users/gustavoiha/Personal/file-storage/packages/backend/src/lib/repository.ts`
- API routes are defined in:
  - `/Users/gustavoiha/Personal/file-storage/infra/cdk/src/stacks/backend-stack.ts`

## Scope

### In Scope (MVP)

- New backend endpoint to list duplicate groups.
- Duplicate discovery for active media in the current dockspace via endpoint.
- Grouping rule: exact same non-empty `contentHash`.
- Review UI to choose what to keep vs trash.
- Bulk trash action for selected repeated media items.
- Progress + partial-failure feedback for bulk trash.

### Out of Scope (MVP)

- Cross-dockspace duplicate detection.
- Background jobs for very large duplicate cleanup operations.
- Permanent delete in duplicate view (Trash only).
- Near-duplicate (perceptual) matching.

## Product Behavior

1. User opens Media workspace and triggers `Find duplicates`.
2. App calls `GET /dockspaces/{dockspaceId}/media/duplicates`.
3. Backend returns duplicate groups (group size `>= 2`) and summary metadata.
4. For each group, app preselects all items except one default keeper.
5. User can change keeper or unselect specific repeated items.
6. User confirms `Move selected to trash`.
7. App executes trash requests, then refreshes Media + Trash views.
8. App shows summary: total moved, failed, and reclaimable bytes affected.

## Duplicate Rules

- Comparison key: `contentHash` only.
- Only `ACTIVE` media items are considered.
- Items with missing/empty `contentHash` are excluded from duplicate groups.
- Default keeper in each group: newest `updatedAt` (tie-breaker: lexicographically smallest `fullPath`).

## Backend Plan

### 1) Add dedicated duplicates endpoint

- New handler:
  - `/Users/gustavoiha/Personal/file-storage/packages/backend/src/handlers/listMediaDuplicates.ts`
- New route in CDK:
  - `GET /dockspaces/{dockspaceId}/media/duplicates`
  - file: `/Users/gustavoiha/Personal/file-storage/infra/cdk/src/stacks/backend-stack.ts`

Behavior:
- Validate user and media dockspace entitlement.
- Return duplicate groups only for `ACTIVE` media with non-empty `contentHash`.
- Support cursor pagination over groups (not over individual media rows).
- Sort groups deterministically by `contentHash` ascending.
- Sort items in each group by `updatedAt` desc, then `fullPath` asc.

### 2) Add repository helper for duplicate grouping

- File:
  - `/Users/gustavoiha/Personal/file-storage/packages/backend/src/lib/repository.ts`
- Add helper like:
  - `listActiveMediaDuplicateGroups(userId, dockspaceId, cursor, limit)`

### 3) Pagination-safe data strategy

Use a dedicated hash index record type so duplicates query does not depend on `/media` listing behavior:
- add `MEDIA_HASH_INDEX` item type in:
  - `/Users/gustavoiha/Personal/file-storage/packages/backend/src/types/models.ts`
- add key helpers in:
  - `/Users/gustavoiha/Personal/file-storage/packages/backend/src/domain/keys.ts`

Suggested key pattern under dockspace PK:
- `SK = H#<contentHash>#L#<fileNodeId>`

Benefits:
- endpoint can query hashes directly and page over grouped duplicate sets,
- no dependency on media list endpoint pagination or payload shape,
- avoids full `L#` scan for every duplicate query.

### 4) Maintain hash index on lifecycle transitions

Update repository write paths so `MEDIA_HASH_INDEX` reflects active state:
- on create/update active media: upsert hash index record,
- on trash/purge: delete hash index record,
- on restore: recreate hash index record.

Primary touchpoints:
- `/Users/gustavoiha/Personal/file-storage/packages/backend/src/lib/repository.ts`
- `/Users/gustavoiha/Personal/file-storage/packages/backend/src/handlers/confirmUpload.ts`
- `/Users/gustavoiha/Personal/file-storage/packages/backend/src/handlers/completeMultipartUpload.ts`
- trash/restore/purge handlers already calling repository state transitions.

### 5) Backfill hash index for existing active media

- New script:
  - `/Users/gustavoiha/Personal/file-storage/packages/backend/src/scripts/backfillMediaHashIndex.ts`
- Build missing `MEDIA_HASH_INDEX` records for active media with `contentHash`.

## UX Plan

### 1) Add duplicate discovery controls

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/pages/DockspaceMediaPage.tsx`
- Add a `Find duplicates` action in the media toolbar.
- Add a new view panel (`Duplicates`) under the `All Media` experience.

### 2) Add duplicate group review UI

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/pages/DockspaceMediaPage.tsx`
- Optional new component:
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/components/media/DuplicateGroupsPanel.tsx`
- Group card displays:
  - representative thumbnail/icon,
  - count of files in group,
  - `contentHash` (shortened),
  - total bytes and estimated reclaimable bytes,
  - per-item controls (`Keep this`, checkbox to trash repeats).

### 3) Confirm bulk trash action

- File:
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/pages/DockspaceMediaPage.tsx`
- Optional dialog:
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/components/media/ConfirmTrashDuplicatesDialog.tsx`
- Confirm copy includes selected count and reclaimable bytes.

### 4) Add styles

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/styles/layout.css`
- Add classes for duplicate panel, group cards, and bulk-action footer.

## Data/State Plan (Frontend)

### 1) Add duplicates query hook

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/hooks/useMedia.ts`
- Add:
  - `mediaDuplicatesQueryKey(userId, dockspaceId, cursor, limit)`
  - `useMediaDuplicates(dockspaceId, cursor, limit)`
- Fetch from new endpoint instead of building groups from `listMedia`.

### 2) Add bulk trash workflow

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/hooks/useFiles.ts`
- Add helper mutation for batched file trashing with bounded concurrency (for example `3`).
- Reuse existing `moveToTrash` API for each selected `fullPath`.
- Preserve partial successes; return summary of successes/failures.

## API Plan

### MVP endpoint contract

New endpoint:
- `GET /dockspaces/{dockspaceId}/media/duplicates?cursor=<opaque>&limit=<n>`

Response (shape):
- `items: DuplicateGroupRecord[]`
- `summary: { groupCount: number; duplicateItemCount: number; reclaimableBytes: number }`
- `nextCursor?: string`

Group record:
- `contentHash: string`
- `items: MediaFileRecord[]`
- `duplicateCount: number`
- `totalGroupSizeBytes: number`
- `reclaimableBytes: number`
- `defaultKeeperFileNodeId: string`

Trash action remains:
- `POST /dockspaces/{dockspaceId}/files/trash`

## Error Handling

- If one trash call fails, continue processing remaining selected files.
- Treat `404` from trash API as non-fatal for summary when item is already non-active.
- Show final operation summary:
  - moved count,
  - failed count,
  - failed file paths (truncated list).

## Testing Plan

### Frontend

- New tests:
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/tests/pages/DockspaceMediaPage.test.tsx`
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/tests/hooks/useMedia.test.tsx`
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/tests/hooks/useFiles.test.tsx`

Test cases:
1. Duplicates query is called and rendered correctly.
2. Pagination with `nextCursor` appends/replaces groups correctly.
3. Default keeper selection is deterministic from backend response.
4. `Find duplicates` renders expected group and summary counts.
5. Bulk trash calls per selected repeat and handles partial failures.
6. Post-success invalidation refreshes media and trash data.

### Backend

- New tests:
  - `/Users/gustavoiha/Personal/file-storage/packages/backend/src/tests/listMediaDuplicates.test.ts`
  - `/Users/gustavoiha/Personal/file-storage/packages/backend/src/tests/mediaHashIndexMaintenance.test.ts`

Test cases:
1. Endpoint returns only duplicate groups (`count >= 2`) for active media.
2. Groups/items are sorted deterministically.
3. Cursor pagination returns stable, non-overlapping pages.
4. Missing `contentHash` items are excluded.
5. Hash index records are updated on upload, trash, restore, purge.

## Delivery Phases

1. Phase 1: backend `GET /media/duplicates` handler + route wiring.
2. Phase 2: hash index model/helpers + index maintenance in repository flows.
3. Phase 3: frontend duplicates query integration and review panel.
4. Phase 4: keeper/selection controls + confirmation dialog.
5. Phase 5: bulk trash orchestration + tests and polish.

## Acceptance Criteria

- User can find duplicate media groups in a media dockspace.
- Groups are based on identical `contentHash`.
- Duplicate discovery uses dedicated backend endpoint, independent of `listMedia` pagination.
- User can keep one media item per group and trash selected repeats.
- Operation supports partial success and reports failures clearly.
- Media and Trash views reflect final state after operation.
