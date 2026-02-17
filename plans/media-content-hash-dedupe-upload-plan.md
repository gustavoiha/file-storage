# Backend-Driven Duplicate Skip and Content Hash Plan

## Goal

Implement backend-driven duplicate detection and skip signaling while storing `contentHash` for both file and media uploads.

Key requirements:

- Backend calculates content hash (not client) for every upload.
- Both `GENERIC_FILES` and `PHOTOS_VIDEOS` uploads persist `contentHash`.
- Duplicate checks happen in upload endpoints, not in client prechecks.
- Client still shows skipped-files card, using duplicate-skip responses from backend.

## Product Behavior

1. `GENERIC_FILES`
- Duplicate rule: same normalized file name in the same folder.
- Upload endpoint returns a duplicate-skip response/error for duplicates.
- Client shows skipped-files card and does not treat these as fatal upload errors.

2. `PHOTOS_VIDEOS`
- Duplicate rule: same content hash among active media.
- Duplicate decision is backend-only.
- Upload endpoint returns duplicate-skip response/error for duplicates.
- Client shows skipped-files card and does not treat these as fatal upload errors.

## High-Level Architecture

### A) Backend hash computation for all uploads

- On finalize (`confirm-upload` or multipart `complete`), backend computes SHA-256 from the uploaded S3 object.
- Backend persists the computed hash in file metadata (`contentHash`).

### B) Backend duplicate detection

- Files duplicate-by-name check happens in upload endpoint path for `GENERIC_FILES`.
- Media duplicate-by-hash check happens in finalize endpoint after backend hash computation.

### C) Duplicate signaling contract

Upload endpoints return structured duplicate skip payloads, for example:

- HTTP: `409`
- Body:
  - `error: "Upload skipped due to duplicate"`
  - `code: "UPLOAD_SKIPPED_DUPLICATE"`
  - `duplicateType: "NAME" | "CONTENT_HASH"`
  - `fullPath: string`
  - `reason: string`

Client classifies this as skipped and continues processing remaining uploads.

## Safety for Skip Semantics

To guarantee "skip" does not accidentally overwrite existing data:

- Use staging upload objects/keys during transfer.
- Run duplicate checks and hash computation before promoting metadata/object.
- If duplicate is detected, delete staging object and return duplicate-skip response.
- If accepted, promote object and finalize metadata.

This avoids destructive overwrite before dedupe decisions.

## Data Model Changes

### Backend

File: `packages/backend/src/types/models.ts`

- Add optional field:
  - `contentHash?: string` on `FileNodeItem`

### Web

Files:
- `apps/web/src/lib/apiTypes.ts`

- Add optional field:
  - `contentHash?: string` on `FileRecord` and `MediaFileRecord`

## Backend API Changes

### 1) Upload finalize endpoints compute + persist hash

Files:
- `packages/backend/src/handlers/confirmUpload.ts`
- `packages/backend/src/handlers/completeMultipartUpload.ts`
- `packages/backend/src/lib/repository.ts`

Changes:

- Remove client-provided `contentHash` dependency.
- Compute SHA-256 server-side from uploaded object.
- Pass computed hash into `upsertActiveFileByPath`.
- Store `contentHash` for both file and media uploads.

### 2) Duplicate skip responses from upload endpoints

Files:
- `packages/backend/src/handlers/createUploadSession.ts`
- `packages/backend/src/handlers/startMultipartUpload.ts`
- `packages/backend/src/handlers/confirmUpload.ts`
- `packages/backend/src/handlers/completeMultipartUpload.ts`

Changes:

- `GENERIC_FILES`: return duplicate-skip response if same-folder same-name already exists.
- `PHOTOS_VIDEOS`: return duplicate-skip response when computed hash already exists among active media.

### 3) Media listing includes hash

File: `packages/backend/src/handlers/listMedia.ts`

- Include `contentHash` in response for observability/UI/debugging consistency.

## Repository and Indexing

To make hash duplicate checks efficient and consistent:

- Add hash lookup support in repository for active files.
- Add hash index records for active files (or equivalent queryable structure).
- Maintain index on create/update/trash/restore/purge transitions.

Potential key pattern:
- `PK`: existing dockspace partition key
- `SK`: `H#<contentHash>#L#<fileNodeId>` (active only)

This supports quick duplicate-by-hash checks without full scans.

## S3 Helpers

File: `packages/backend/src/lib/s3.ts`

Add helpers for:

- Reading object stream and computing SHA-256.
- Staging object promotion (if staging-key flow is used).
- Staging object cleanup on duplicate skip.

## Client Changes

### 1) Remove client dedupe prechecks

Files:
- `apps/web/src/pages/DockspaceFilesPage.tsx`
- `apps/web/src/pages/DockspaceMediaPage.tsx`
- `apps/web/src/hooks/useDockspaceUploadDialog.ts`

Changes:

- Remove client-side duplicate name/hash checks.
- Continue local path/media-type validation only.

### 2) Handle duplicate skip API responses

Files:
- `apps/web/src/lib/apiClient.ts`
- `apps/web/src/hooks/useDockspaceUploadDialog.ts`

Changes:

- Extend `ApiError` to include backend error code metadata.
- In upload queue, treat `UPLOAD_SKIPPED_DUPLICATE` as skipped item, not fatal error.
- Aggregate skipped files and show dismiss-only skipped card.

### 3) Preserve skipped card UX

Files:
- `apps/web/src/components/files/DockspaceSidebar.tsx`
- `apps/web/src/pages/DockspaceMediaPage.tsx`
- `apps/web/src/styles/layout.css`

- Keep dismiss-only skipped-files card in both files and media upload surfaces.

## Backfill Plan

Because both file and media now store `contentHash`, add one-time backfill for existing file nodes.

### New script

Files:
- `packages/backend/src/lib/backfillFileContentHash.ts`
- `packages/backend/src/scripts/backfillFileContentHash.ts`

Behavior:

- Scan file nodes missing `contentHash`.
- For nodes with existing S3 object, compute SHA-256 server-side and update metadata.
- Maintain hash index entries for active files.
- Track counters: scanned, eligible, updated, missing-object, already-populated, failed.
- Support dry-run/page-size/max-pages controls.

### Wiring and docs

Files:
- `packages/backend/package.json` add `backfill:file-content-hash`
- `README.md` add runbook section (dry run + write run)

## Validation Rules

- Hash algorithm: SHA-256.
- Canonical storage format: lowercase hex, 64 chars.
- Backend owns validation and normalization.

## Testing Plan

### Backend tests

1. Upload handlers
- duplicate-by-name returns `UPLOAD_SKIPPED_DUPLICATE` for `GENERIC_FILES`.
- duplicate-by-hash returns `UPLOAD_SKIPPED_DUPLICATE` for `PHOTOS_VIDEOS`.
- non-duplicate uploads still succeed.

2. Repository
- `contentHash` stored on create/update for both workspace types.
- hash index maintenance across state changes.

3. Hash computation
- S3 stream hash helper correctness and error handling.

4. Backfill
- dry-run metrics only.
- write mode updates expected records.
- missing object behavior is counted and non-fatal.

### Web tests

1. Upload hook
- duplicate-skip API errors are collected into skipped notice.
- non-duplicate errors remain fatal and surfaced in error UI.
- dismiss clears skipped notice.

2. Files page/sidebar
- duplicate-by-name skip response appears in skipped card.

3. Media page
- duplicate-by-hash skip response appears in skipped card.

## Rollout Sequence

1. Backend: hash computation + metadata persistence for all uploads.
2. Backend: duplicate-skip contract and index/query support.
3. Web: duplicate-skip error classification + skipped card integration.
4. Backfill existing file nodes and hash index.
5. Monitor duplicate-skip counts and upload error rates.

## Acceptance Criteria

1. Backend computes and stores `contentHash` for both file and media uploads.
2. Client does not perform duplicate prechecks for name/hash.
3. Upload endpoints return structured duplicate-skip responses.
4. Client shows skipped files in both files sidebar and media upload queue, with dismiss-only action.
5. Backfill populates `contentHash` for historical file nodes.
