# Repository TODOs

- [ ] Dockspaces page: show 3 featured metrics for each dockspace, including total number of files, total size, and one additional metric (for example: last upload date).
- [ ] Backend/API: tighten CORS `allowOrigins` from `*` to the actual dev domain once the final local/dev domain setup is in place.
- [ ] Backend: replace `ScanCommand` in `purgeReconciliation` with a GSI query.
- [ ] Backend: rework querying for trash or purged files nodes so that the state information is directly in the PK or SK keys, to avoid doing a filter.
- [ ] Frontend: implement deleting a folder. It will show a confirmation before deleting. If there are files or folder nodes inside the folder, trash them one by one, recursively, in the frontend-side.
- [ ] Frontend: improve mutation cache handling for files/directories by applying targeted React Query cache updates (optimistic/patched state) instead of full refetch invalidation after each mutation.
