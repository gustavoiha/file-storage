# Folder Rename Conflict Plan

## Goal

Ensure folder rename is explicitly disallowed when the new name conflicts with an existing sibling folder, with consistent behavior and clear user feedback, and allow rename from folder breadcrumbs via right-click.

## Current State

- Backend already returns `409` conflict in `renameFolder` when a sibling folder with the target name exists.
- Frontend rename dialog currently submits and surfaces backend errors, but has no local conflict pre-check against loaded sibling folders.
- Folder action menu (including rename) is available on folder rows, but not from breadcrumb items.

## Target Behavior

1. User opens `Rename folder`.
2. User enters a new name.
3. If the normalized name conflicts with another folder in the same parent, submission is blocked and inline error is shown.
4. Server remains the source of truth and still returns `409` for race conditions.
5. Dialog shows a consistent message for conflict from either client pre-check or backend response.
6. User can right-click a non-root folder breadcrumb and open the same folder actions dropdown used in folder rows, including `Rename`.

## Implementation Plan

### 1) Frontend conflict validation before submit

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/pages/DockspaceFilesPage.tsx`
- Build a lookup map of sibling folders for the folder being renamed.
- Reuse normalized comparison strategy (trim + normalized case/slug strategy matching backend behavior).
- In `onRenameFolderSubmit`, short-circuit with validation error when conflict is detected locally.

### 2) Add breadcrumb right-click folder actions

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/components/files/FileList.tsx`
- Extend breadcrumb rendering to support `onContextMenu` for each non-root crumb.
- Open the same dropdown menu component and actions used by folder rows (same `Rename` item and callback wiring).
- Ensure root breadcrumb (`/`) does not expose rename action.

### 3) Keep backend conflict guard as authoritative

- File: `/Users/gustavoiha/Personal/file-storage/packages/backend/src/handlers/renameFolder.ts`
- No behavior change required for base rule.
- Ensure returned error string remains stable and explicit for UI mapping.

### 4) Standardize dialog error messaging

- Files:
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/pages/DockspaceFilesPage.tsx`
  - `/Users/gustavoiha/Personal/file-storage/apps/web/src/components/files/RenameFolderDialog.tsx`
- Use a single message format, for example:
  - `A folder with this name already exists in this location.`

### 5) Regression and race-condition handling

- If pre-check passes but backend returns `409`, keep dialog open and show same conflict message.
- Do not clear input on failure.

## Edge Cases

- Renaming with only whitespace changes should be treated as unchanged and not fail.
- Name normalization conflicts should be blocked (`Docs` vs `docs` if equivalent by normalization).
- Root folder rename remains disallowed.

## Test Plan

### Frontend tests

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/tests/pages/DockspaceFilesPage.test.tsx`
1. Submitting conflicting folder name shows inline conflict and does not call mutation.
2. Backend conflict error keeps dialog open and shows conflict message.
3. Non-conflicting rename still calls mutation and closes dialog on success.
4. Right-clicking a non-root breadcrumb opens the folder actions dropdown and triggers rename callback for that breadcrumb folder path.
5. Right-clicking root breadcrumb does not show rename option.

### Backend tests

- File: `/Users/gustavoiha/Personal/file-storage/packages/backend/src/tests`
1. Rename to existing sibling returns `409`.
2. Rename to same normalized target remains deterministic.

## Acceptance Criteria

- Conflict rename is blocked before request when local sibling data is sufficient.
- Backend still blocks conflict with `409` for race conditions.
- User sees a clear, consistent conflict message in all conflict paths.
- User can trigger the same rename action from a non-root breadcrumb via right-click.
