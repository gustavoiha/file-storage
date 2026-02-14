# Sidebar Directory Tree Plan

## Goal

Add a GitHub-like folder tree in the dockspace sidebar that:
- shows folders only,
- shows a direct file-count label for each folder,
- lazily discovers folder children,
- expands/collapses as an accordion,
- shares discovery/navigation state with the main dockspace browser.

## Product Behavior

1. Sidebar includes a new `Directory` section under existing actions/uploads areas.
2. Tree renders only folders (no file rows).
3. Each folder row displays a count badge for direct files in that folder (not recursive).
4. Clicking a folder row:
   - first click expands/collapses accordion state,
   - also navigates/open that folder in the main file browser using shared navigation state.
5. If folder children have not been discovered yet, expansion triggers fetch and shows a loading indicator.
6. Expanded state is preserved while user navigates in the same dockspace session.

## Current State

- Main navigation state is local in `DockspaceFilesPage.tsx` (`folderTrail` and current folder).
- Sidebar currently only shows actions and active uploads.
- Folder contents are fetched with `useFiles(dockspaceId, parentFolderNodeId)` and `listFolderChildren`.

## Shared State Design

Create a single dockspace-browser state source to drive both main content and sidebar tree.

### New state module

- New file: `/Users/gustavoiha/Personal/file-storage/apps/web/src/lib/dockspaceBrowserStore.ts`

State shape (conceptual):
- `currentFolderPath: string`
- `currentFolderNodeId: string`
- `folderTrail: Array<{ folderNodeId; fullPath; name }>`
- `expandedFolderNodeIds: Set<string>`
- `discoveredByFolderNodeId: Map<string, DirectoryChildrenRecord>`
- `loadingFolderNodeIds: Set<string>`

Actions (conceptual):
- `openFolder(path, nodeId, name)`
- `toggleExpanded(nodeId)`
- `setDiscoveredChildren(nodeId, children)`
- `setLoading(nodeId, isLoading)`
- `resetForDockspace(dockspaceId)`

## Data Fetching Strategy

1. Keep current main-pane query for active folder via `useFiles`.
2. For sidebar tree, add lazy folder-children fetch on expand for node ids not yet discovered.
3. Cache discovered children in shared store keyed by `folderNodeId`.
4. File-count label computation for each folder:
   - use discovered children set for that folder,
   - `directFileCount = children.items.filter(child => child.childType === 'file').length`.
5. If folder is not yet discovered, show count placeholder (for example `...`) until fetched.

## Component Changes

### 1) Sidebar tree UI

- Update file: `/Users/gustavoiha/Personal/file-storage/apps/web/src/components/files/DockspaceSidebar.tsx`
- Add new section component (or extracted child component):
  - `DirectoryTree`
  - recursive `DirectoryTreeNode`
- Row content:
  - chevron (expand/collapse),
  - folder name,
  - direct file-count badge.
- Loading indicator shown when node expansion triggers fetch and data is pending.

### 2) Page integration

- Update file: `/Users/gustavoiha/Personal/file-storage/apps/web/src/pages/DockspaceFilesPage.tsx`
- Replace local-only folder navigation state with shared store/hook values.
- Pass sidebar tree props:
  - root folder node/path,
  - expanded/discovered/loading states,
  - handlers for open/toggle/load.
- Ensure both main `FileList` and sidebar tree call the same `openFolder` action.

### 3) Optional hook abstraction

- New file (optional): `/Users/gustavoiha/Personal/file-storage/apps/web/src/hooks/useDockspaceBrowserState.ts`
- Encapsulate store reads/writes and lazy loading behavior.

## Interaction Details

- Accordion semantics:
  - if collapsed: click expands and optionally navigates to folder.
  - if expanded: click collapses; optional separate label click can keep navigation explicit.
- Keyboard:
  - `Enter`/`Space` toggles expansion.
  - Arrow keys can be added in follow-up, but baseline should support tab + enter access.
- Discoverability:
  - section title and visual hierarchy should match existing sidebar style language.

## Loading and Error States

- Per-node loading spinner during first-time child fetch.
- Per-node error message or retry control when fetch fails.
- Failed node should remain collapsible and retryable without breaking rest of tree.

## Sync Rules With Main Browser

- Opening folder from main list updates highlighted/active node in sidebar tree.
- Opening folder from sidebar updates main list and breadcrumbs immediately.
- Both surfaces read and write through same store to avoid divergence.

## Styling

- Update file: `/Users/gustavoiha/Personal/file-storage/apps/web/src/styles/layout.css`
- Add styles for:
  - tree indentation per depth,
  - disclosure chevron transitions,
  - count badge,
  - active folder highlight,
  - loading spinner and subtle skeleton/placeholder text.

## Testing Plan

### Component tests

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/tests/components/DockspaceSidebar.test.tsx` (new)
1. Renders folder nodes only.
2. Shows direct file-count labels for discovered folders.
3. Shows loading indicator when expanding undiscovered folder.
4. Expands/collapses node on click.

### Page/store integration tests

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/tests/pages/DockspaceFilesPage.test.tsx`
1. Opening folder in sidebar updates main file list folder context.
2. Opening folder in main list updates active state in sidebar tree.
3. Shared store retains discovered children and avoids duplicate fetch for already discovered node.

### Hook/store tests

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/tests/hooks/useDockspaceBrowserState.test.tsx` (if hook is added)
1. Toggle expansion state behaves deterministically.
2. Discovered cache updates correctly by folder node id.
3. Loading state is per-node and cleared on success/failure.

## Delivery Phases

1. Phase 1: shared store/state extraction from page-level folder navigation.
2. Phase 2: sidebar tree rendering + accordion interactions.
3. Phase 3: lazy discovery fetch + loading/error indicators + count badges.
4. Phase 4: synchronization polish with main browser and tests.

## Acceptance Criteria

- Sidebar shows a folder-only directory tree with direct file-count labels.
- Expanding undiscovered folder shows loading and fetches children lazily.
- Tree expansion behaves like an accordion and reveals nested folders.
- Main browser and sidebar remain synchronized through shared state.
- Behavior is discoverable and consistent with existing dockspace navigation patterns.
