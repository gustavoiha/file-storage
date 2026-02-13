# Repository TODOs

## Dockspace Insights

- [ ] Show 3 featured metrics for each dockspace, including total number of files, total size, and one additional metric (for example: last upload date).

## Upload Experience

- [ ] Implement uploading an entire local folder (including nested subfolders) into the current dockspace folder, preserving relative paths and showing per-file upload progress/errors.
- [ ] Implement S3 multipart uploads for very large files (threshold-based fallback from single PUT), including retry/abort flow and final metadata confirmation.

## File Browser Operations

- [ ] Implement deleting a folder. Show a confirmation before deleting. If there are files or folder nodes inside the folder, trash them one by one recursively on the client side.
- [ ] Strengthen folder rename flow so renaming is blocked when the destination name conflicts with an existing sibling folder, with clear conflict messaging in the dialog.
- [ ] Implement move-to-folder for files only, with multi-select support and hover checkboxes that replace file/folder icons while selecting.
- [ ] Improve mutation cache handling for files/directories by applying targeted React Query cache updates (optimistic/patched state) instead of full refetch invalidation after each mutation.

## Data Lifecycle And Querying

- [ ] Replace `ScanCommand` in `purgeReconciliation` with a GSI query.
- [ ] Rework querying for trash or purged file nodes so state information is encoded directly in PK or SK keys, avoiding filter-based reads.

## Platform Configuration

- [ ] Tighten CORS `allowOrigins` from `*` to the actual dev domain once the final local/dev domain setup is in place.
