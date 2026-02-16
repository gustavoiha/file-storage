# S3 Versioning Resiliency Plan (High Level)

## Objective

Increase dockspace file durability and recoverability by enabling S3 bucket versioning, while updating trash/purge behavior so lifecycle and reconciliation remain correct and predictable.

## Current Baseline

- Bucket versioning is currently not enabled (`infra/cdk/src/stacks/storage-stack.ts`).
- Trashing marks metadata as `TRASH` and tags the S3 object with `state=TRASH`.
- Purge reconciliation marks metadata as `PURGED` when `HeadObject` says object no longer exists.

## Why Versioning Changes Trash/Purge

With versioning enabled:
- Deleting/expiring current object typically creates a delete marker.
- Previous object versions may still exist.
- `HeadObject` without `versionId` may return not found even when noncurrent versions still exist.

So current purge check (`objectExists === false`) is no longer equivalent to “all data versions removed.”

## Target Behavior

1. Versioning enabled on the file bucket for rollback/recovery protection.
2. Trash operation remains logical (user-visible state), but storage lifecycle is version-aware.
3. Purge operation semantics are strict:
   - `PURGED` means “all versions removed”.
4. Reconciliation logic is adjusted to match chosen purge definition.

## Purge Semantics

- `PURGED` means all object versions/delete markers for a file key are removed.

This is the enforced contract (“confirmed gone from S3”) after versioning is introduced.

## High-Level Implementation

### 1) Infrastructure: Enable Versioning + Version-Aware Lifecycle

- Update bucket in `infra/cdk/src/stacks/storage-stack.ts`:
  - enable versioning.
  - keep abort-incomplete-multipart rule.
  - add noncurrent-version lifecycle policies for aged trash data.

Lifecycle guidance:
- current version trash handling remains tag-based.
- add noncurrent version expiration so old versions do not accumulate indefinitely.
- add expired delete marker cleanup where appropriate.

### 2) S3 Helpers: Add Version-Aware APIs

- Extend `packages/backend/src/lib/s3.ts` with helpers for:
  - listing object versions for a key,
  - deleting all versions/delete markers for a key (batched),
  - checking whether any versions remain.

### 3) Trash Flow Adjustments

- Keep current UX/metadata behavior for trash.
- Ensure tagging behavior is compatible with versioning:
  - explicitly decide whether tags apply only current version or specific version.
- If needed, persist version metadata (`versionId`) for observability/debugging.

### 4) Purge/Reconciliation Adjustments

- Update purge reconciliation (`packages/backend/src/handlers/purgeReconciliation.ts`) to use version-aware checks.
- Required behavior:
  - when due, remove all versions/delete markers for object key,
  - then mark metadata `PURGED`.
- Reconciliation must stay idempotent and safe to re-run.

### 5) Observability and Safety

- Add structured logs for version purge actions:
  - object key, versions discovered, versions deleted, failure reason.

## Additional Recommended Measures

### Availability

- Keep robust retry/backoff for S3 operations in reconciliation jobs.
- Separate reconciliation throughput controls to avoid long-running spikes.

## Migration / Rollout Phases

1. Enable versioning + lifecycle updates in infra.
2. Ship version-aware S3 helper methods.
3. Update reconciliation and purge semantics implementation.
4. Validate end-to-end trash/purge behavior in staging with versioned objects.
5. Roll out production with post-deploy verification.

## Testing (High Level)

1. Unit tests for version list/delete helper logic.
2. Integration tests:
   - trash file -> object versions remain recoverable,
   - purge due -> all versions removed -> metadata `PURGED`.
3. Regression tests for restore/download flows with versioned bucket.
4. Operational test for large version-count objects.

## Acceptance Criteria

- S3 versioning is enabled for dockspace files.
- Trash and purge semantics are explicitly defined and implemented for versioned storage.
- Reconciliation no longer relies on non-version-aware existence checks alone.
- Version accumulation is lifecycle-managed.
- Additional resiliency/security controls are documented with implementation decisions.
