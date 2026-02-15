# Purge Reconciliation GSI Query Plan (High Level)

## Objective

Replace full-table `ScanCommand` usage in `purgeReconciliation` with an indexed query path so the reconciliation job scales with due-to-purge items instead of table size.

## Current Problem

Current flow in `/Users/gustavoiha/Personal/file-storage/packages/backend/src/handlers/purgeReconciliation.ts`:

1. Scans the whole table for `DOCKSPACE` items.
2. For each dockspace, queries trashed files.
3. Filters in Lambda by `flaggedForDeleteAt <= now`.

This is expensive and grows linearly with total dockspaces/files, even when only a small subset is due for purge.

## High-Level Design

Use `GSI1` as a due-for-purge index for file nodes currently in trash.

### Indexing strategy

When a file is moved to trash, write GSI keys on the file node:

- `GSI1PK = "PURGE_DUE"`
- `GSI1SK = "{flaggedForDeleteAt}#{PK}#{SK}"`

Where:
- `PK` is dockspace partition key (`U#{userId}#S#{dockspaceId}`)
- `SK` is file node key (`L#{fileNodeId}`)

This enables querying all due items with one indexed range query:
- `GSI1PK = :purgeDue`
- `GSI1SK <= :upperBoundNow`

### Lifecycle updates

- On trash: set `GSI1PK/GSI1SK`.
- On restore: remove `GSI1PK/GSI1SK`.
- On overwrite/reactivation (`upsertActiveFileByPath`): ensure `GSI1PK/GSI1SK` are removed.
- On purged mark: remove `GSI1PK/GSI1SK` to prevent future reprocessing.

## Implementation Areas

### 1) Repository write paths

Update write operations in `/Users/gustavoiha/Personal/file-storage/packages/backend/src/lib/repository.ts` to maintain index fields consistently:

- `markResolvedFileNodeTrashed`
- `restoreFileNodeFromTrash`
- `upsertActiveFileByPath`
- `markFileNodePurged`

Add small helper builders for purge index keys (new helper location can be `domain/keys.ts` or repository-local utility).

### 2) Reconciliation handler query

Replace scan logic in `/Users/gustavoiha/Personal/file-storage/packages/backend/src/handlers/purgeReconciliation.ts` with:

- `QueryCommand` on `IndexName: "GSI1"`
- key condition for due items (`<= now`)
- paginated processing loop

For each returned due item:

1. Check object existence in S3.
2. If object no longer exists, mark purged.
3. If object still exists, leave item indexed for next run.

### 3) Infra and schema

`GSI1` already exists in `/Users/gustavoiha/Personal/file-storage/infra/cdk/src/stacks/storage-stack.ts`.

Likely no new index is required; this is a key-population and query-usage migration.

## Migration / Backfill

Existing trashed records will not have new GSI keys.

Add a one-time backfill script/job to populate `GSI1PK/GSI1SK` for file nodes where:

- `deletedAt` exists
- `purgedAt` does not exist
- `flaggedForDeleteAt` exists

Until backfill completes, reconciliation must either:
- temporarily keep legacy fallback logic, or
- run backfill first before switching handler.

Recommended: short dual-read transition, then remove fallback.

## Safety and Correctness Rules

- Reconciliation must remain idempotent.
- Conditional updates in `markFileNodePurged` remain authoritative.
- Index key updates must be in the same transactional write where state changes when possible.

## Testing Strategy

### Backend unit/integration tests

- Trashing sets GSI keys correctly.
- Restore/active overwrite clears GSI keys.
- Purged mark clears GSI keys.
- Reconciliation queries GSI and processes only due entries.
- Pagination path processes all pages.

### Migration tests

- Backfill populates missing GSI keys for eligible trashed records.
- No mutations for active/purged files.

### Regression checks

- Trash and restore APIs continue to work unchanged.
- List trash/purged behavior remains unchanged externally.

## Rollout Phases

1. Add index-key maintenance in repository write paths.
2. Add and run backfill for existing trashed records.
3. Switch reconciliation handler from scan flow to GSI query flow.
4. Remove temporary fallback and keep only GSI path.

## Acceptance Criteria

- `purgeReconciliation` no longer uses `ScanCommand`.
- Reconciliation reads due candidates via `GSI1` query.
- Trashed/restored/purged file state transitions keep GSI keys consistent.
- Operational cost and read volume are significantly reduced compared to full scan approach.
