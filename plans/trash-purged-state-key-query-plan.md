# Trash/Purged State-Key Query Plan (High Level)

## Objective

Rework trash and purged listing so state is encoded in key design (PK/SK), removing filter-based reads over all file nodes per dockspace.

## Replanning Context

- `purgeReconciliation` has already moved to `GSI1` with `GSI1PK = PURGE_DUE` for due-to-purge processing.
- Because `GSI1` is now dedicated to purge scheduling, trash/purged listing should not depend on overloading the same index key fields on file nodes.
- Current `listTrashedFileNodes` / `listPurgedFileNodes` still query all `L#` items in a dockspace and then filter in application code by state attributes.

## High-Level Approach

Introduce explicit state index records in the primary table (same PK, state-prefixed SK), so querying trash or purged is a direct key query.

### Proposed state index record shape

- `PK = U#{userId}#S#{dockspaceId}`
- `SK = X#TRASH#{flaggedForDeleteAt}#{fileNodeId}` for trashed entries
- `SK = X#PURGED#{purgedAt}#{fileNodeId}` for purged entries
- `type = FILE_STATE_INDEX`

Recommended payload on index records:
- `fileNodeId`
- `trashedPath`
- `size` (for trash list)
- `deletedAt`
- `flaggedForDeleteAt`
- `purgedAt` (for purged list)

This keeps list handlers mostly read-only from the index and avoids per-item state filtering.

## Query Model

- Trash list:
  - `PK = dockspace pk`
  - `begins_with(SK, 'X#TRASH#')`
- Purged list:
  - `PK = dockspace pk`
  - `begins_with(SK, 'X#PURGED#')`

Ordering:
- Keep current UX ordering by encoding timestamp in SK and using `ScanIndexForward` accordingly.

## Write Path Changes

Update repository transitions to maintain state index items consistently:

1. `markResolvedFileNodeTrashed`
   - add `FILE_STATE_INDEX` trash record
2. `restoreFileNodeFromTrash`
   - remove trash index record
3. `markFileNodePurged`
   - remove trash index record
   - add purged index record
4. Reactivation paths (`upsertActiveFileByPath`)
   - remove stale state index records if present

All state transitions should update file node + state index in the same transaction where possible.

## Handler Changes

- `/Users/gustavoiha/Personal/file-storage/packages/backend/src/handlers/listTrash.ts`
  - switch to querying trash state index items directly
- `/Users/gustavoiha/Personal/file-storage/packages/backend/src/handlers/listPurged.ts`
  - switch to querying purged state index items directly

Repository methods to add/update:
- `listTrashedFileStateIndex(...)`
- `listPurgedFileStateIndex(...)`

## Migration / Backfill

Existing trashed/purged file nodes will not have state index records initially.

Add one-time backfill:
- scan/iterate file nodes by dockspace partition
- emit `X#TRASH#...` records for `deletedAt && !purgedAt`
- emit `X#PURGED#...` records for `purgedAt`

Rollout recommendation:
1. Deploy write-path dual-write first.
2. Run backfill.
3. Switch read handlers to state-index queries.
4. Remove legacy fallback reads.

## Testing (High Level)

1. Repository transition tests:
   - trash creates index record
   - restore removes trash index
   - purge moves trash index to purged index
2. Handler tests:
   - listTrash/listPurged query index records without filter logic
   - ordering remains correct
3. Migration tests:
   - backfill creates expected index records
   - no duplicates on rerun (idempotent behavior)

## Acceptance Criteria

- Trash and purged listing no longer filter file nodes in memory by state.
- State is queryable via PK/SK key patterns (`X#TRASH#...`, `X#PURGED#...`).
- Purge reconciliation continues using `GSI1` independently.
- API responses for trash/purged remain backward-compatible.
