# Repository TODOs

## Dockspace Insights

- [x] Show 3 featured metrics for each dockspace, including total number of files, total size, and one additional metric (for example: last upload date). Plan: `/Users/gustavoiha/Personal/file-storage/plans/dockspace-featured-metrics-records-plan.md`.

## Upload Experience

- [x] Implement uploading an entire local folder (including nested subfolders) into the current dockspace folder, preserving relative paths and showing per-file upload progress/errors.
- [x] Implement S3 multipart uploads for very large files (threshold-based fallback from single PUT), including retry/abort flow and final metadata confirmation. Plan: `multipart-upload-large-files-plan.md`.

## File Browser Operations

- [x] Implement trashing an entire folder recursively, including all descendant files and subfolders, with confirmation and clear progress/error feedback.
- [x] Strengthen folder rename flow so renaming is blocked when the destination name conflicts with an existing sibling folder, with clear conflict messaging in the dialog.
- [x] Add a sidebar directory tree (folders only) that shows direct file-count labels per folder, uses shared discoverable state with the main dockspace navigation, and supports accordion expansion with loading indicators for undiscovered children.
- [x] Implement move-to-folder for files only, with multi-select support and hover checkboxes that replace file/folder icons while selecting. Plan: `/Users/gustavoiha/Personal/file-storage/plans/move-files-multi-select-plan.md`.
- [ ] Add a "Purge now" action in Trash so each file can be purged immediately after confirmation, bypassing trash retention time. Plan: `/Users/gustavoiha/Personal/file-storage/plans/purge-now-feature-plan.md`.

## Data Lifecycle And Querying

- [x] Phase 1: Add GSI index-key maintenance in repository write paths for trash/restore/purge transitions. Plan: `/Users/gustavoiha/Personal/file-storage/plans/purge-reconciliation-gsi-plan.md`.
- [x] Phase 2: Add and run backfill for existing trashed records to populate GSI purge-due keys. Plan: `/Users/gustavoiha/Personal/file-storage/plans/purge-reconciliation-gsi-plan.md`.
- [x] Phase 3: Switch `purgeReconciliation` from scan flow to `GSI1` query flow. Plan: `/Users/gustavoiha/Personal/file-storage/plans/purge-reconciliation-gsi-plan.md`.
- [x] Phase 4: Remove temporary fallback logic and keep only the GSI reconciliation path. Plan: `/Users/gustavoiha/Personal/file-storage/plans/purge-reconciliation-gsi-plan.md`.
- [x] Rework querying for trash or purged file nodes so state information is encoded directly in PK or SK keys, avoiding filter-based reads. Plan: `/Users/gustavoiha/Personal/file-storage/plans/trash-purged-state-key-query-plan.md`.

## Platform Configuration

- [x] Tighten CORS `allowOrigins` from `*` to environment domains (`dev: dockspace-dev.officiarte.it`, `prod: dockspace.officiarte.it`).
- [x] Tighten S3 data resiliency by enabling versioning for dockspace files, with updated trash/purge semantics and controls for resiliency, availability, and security. Plan: `/Users/gustavoiha/Personal/file-storage/plans/s3-versioning-resiliency-plan.md`.
- [ ] Enable S3 bucket replication (CRR or SRR) for dockspace files to improve disaster recovery resiliency.
