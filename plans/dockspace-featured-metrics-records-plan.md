# Dockspace Featured Metrics Plan (High Level)

## Objective

Show 3 featured metrics per dockspace on the dockspaces page using precomputed DynamoDB records (not runtime-heavy aggregation queries):

- total files (excluding purged files)
- total size in bytes (excluding purged files)
- last upload timestamp (example third metric)

## Why Replan This Way

- Current `listDockspaces` returns only basic dockspace metadata.
- Computing metrics at request time from file nodes would require expensive per-dockspace reads.
- Dedicated metric records keep reads fast and predictable.

## Data Model

Add a dedicated metrics item per dockspace:

- `PK = U#{userId}`
- `SK = M#S#{dockspaceId}`
- `type = DOCKSPACE_METRICS`
- `dockspaceId`
- `totalFileCount` (number)
- `totalSizeBytes` (number)
- `lastUploadAt` (ISO string, optional)
- `updatedAt` (ISO string)

Notes:
- Keeps metrics co-located with dockspace list partition for efficient retrieval.
- Keeps file-node table shape unchanged for normal file operations.

## Read Path

Update list-dockspaces flow to join dockspace items with metrics records:

1. Query dockspace items (`S#...`) for user.
2. Query metrics items (`M#S#...`) for same user.
3. Merge by `dockspaceId`.
4. Return dockspace payload including metrics (default zeros if metrics record missing).

## Write Path (Write-Through Metrics Updates)

Update existing mutation paths to maintain metrics incrementally:

1. Create dockspace:
   - initialize metrics record with zeros.
2. File upload confirm/complete (`upsertActiveFileByPath`):
   - new file: `count +1`, `size +file.size`, set `lastUploadAt = now`.
   - overwrite existing file: `size += (newSize - oldSize)`, set `lastUploadAt = now`.
3. Move to trash (`markResolvedFileNodeTrashed`):
   - no change to `count` or `size`.
4. Restore from trash (`restoreFileNodeFromTrash`):
   - no change to `count` or `size`.
5. Purge transition:
   - `count -1`, `size -file.size`.

Keep updates in the same transactional flow as file state changes where possible to avoid drift.

## API/Frontend Changes

### Backend response shape

Extend `listDockspaces` response with optional metrics fields:

- `totalFileCount`
- `totalSizeBytes`
- `lastUploadAt`

### Frontend

1. Extend `Dockspace` API type to include these metrics.
2. Update `DockspaceList` UI to show 3 featured metrics per dockspace.
3. Format:
   - file count (integer)
   - total size (human readable)
   - last upload date (relative or formatted absolute date)

## Backfill / Migration

For existing dockspaces, create metrics records by one-time backfill:

1. Iterate dockspaces per user.
2. Count non-purged files and sum non-purged sizes.
3. Derive `lastUploadAt` from latest active upload timestamp (or `updatedAt`/`createdAt` fallback).
4. Write metrics records.

Deploy strategy:
1. Ship read path with safe defaults (missing metrics => zeros).
2. Run backfill.
3. Enable/ship final UI display once coverage is sufficient.

## Consistency and Safety

- Metrics are derived state; source of truth remains file nodes.
- Add reconciliation job/script to detect and repair metric drift (optional but recommended).
- Use conditional updates to avoid negative counters.

## Testing (High Level)

1. Repository tests for each mutation path updating metrics correctly.
2. Handler tests for merged list-dockspaces response with defaults.
3. Frontend tests for rendering 3 metrics and missing-metrics fallback.
4. Backfill test for idempotency and correctness.

## Rollout Phases

1. Add metrics item model + list read merge with default fallback.
2. Implement write-through metric updates in mutation paths.
3. Run one-time backfill for existing data.
4. Enable dockspace-page metric cards and finalize formatting/polish.

## Acceptance Criteria

- Dockspaces page shows 3 metrics for each dockspace.
- Metrics are loaded from dedicated DynamoDB metric records.
- No runtime per-dockspace full file scans are needed for listing metrics.
- Trashing/restoring files does not change total count or total size metrics.
- Purging files changes total count and total size metrics.
