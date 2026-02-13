# Multipart Upload Plan For Very Large Files

## Goal

Add multipart upload support for very large files while preserving the current single-request upload flow for smaller files.

## Why This Is Needed

- Current upload flow signs a single `PutObject` URL, then confirms metadata.
- Single PUT uploads are less resilient for very large files and are constrained by S3 single-object PUT limits.
- Multipart upload provides better reliability, parallel transfer, and retry granularity.

## Current Baseline

- Existing endpoints:
  - `POST /dockspaces/{dockspaceId}/files/upload-session`
  - `POST /dockspaces/{dockspaceId}/files/confirm-upload`
- Backend currently uses `PutObjectCommand` presigned URL generation in `packages/backend/src/lib/s3.ts`.
- Metadata upsert already works for any valid `fullPath` and `s3Key`.

## Scope

### In Scope (MVP)

- Threshold-based client selection between single PUT and multipart.
- Multipart session create + part URL signing + complete + abort APIs.
- Frontend multipart upload runner with chunking, bounded concurrency, and retries.
- Final confirmation reusing existing metadata semantics.

### Out of Scope (MVP)

- Resume across browser restarts.
- Pause/resume UI controls.
- Server-side persisted multipart session registry.
- Transfer acceleration and regional edge optimization.

## Functional Behavior

1. User selects file.
2. Client chooses strategy:
   - if `file.size < MULTIPART_THRESHOLD_BYTES`: keep current upload path.
   - otherwise: use multipart path.
3. Multipart path:
   - Start multipart session (returns `uploadId`, `objectKey`, `fileNodeId`, `partSize`, `partCount`).
   - Request presigned URLs for pending parts in batches.
   - Upload parts in parallel with retries.
   - Complete multipart upload with collected `{ partNumber, etag }`.
   - Confirm metadata write in DynamoDB.
4. On failure after session start, client can call abort.

## API Design

### 1) Start Multipart Session

- `POST /dockspaces/{dockspaceId}/files/multipart/start`
- Body:
  - `fullPath: string`
  - `contentType: string`
  - `size: number`
- Response:
  - `uploadId: string`
  - `objectKey: string`
  - `fileNodeId: string`
  - `partSize: number`
  - `partCount: number`
  - `expiresInSeconds: number`

### 2) Presign Part URLs

- `POST /dockspaces/{dockspaceId}/files/multipart/part-urls`
- Body:
  - `objectKey: string`
  - `uploadId: string`
  - `partNumbers: number[]`
- Response:
  - `urls: Array<{ partNumber: number; uploadUrl: string; expiresInSeconds: number }>`

### 3) Complete Multipart

- `POST /dockspaces/{dockspaceId}/files/multipart/complete`
- Body:
  - `fullPath: string`
  - `objectKey: string`
  - `uploadId: string`
  - `parts: Array<{ partNumber: number; etag: string }>`
  - `size: number`
  - `contentType: string`
- Response:
  - same shape as current confirm response (`fullPath`, `state`, `updatedAt`).

### 4) Abort Multipart

- `POST /dockspaces/{dockspaceId}/files/multipart/abort`
- Body:
  - `objectKey: string`
  - `uploadId: string`
- Response:
  - `{ aborted: true }`

## Backend Implementation Details

### New Handler Files

- `packages/backend/src/handlers/startMultipartUpload.ts`
- `packages/backend/src/handlers/getMultipartPartUrls.ts`
- `packages/backend/src/handlers/completeMultipartUpload.ts`
- `packages/backend/src/handlers/abortMultipartUpload.ts`

### S3 Library Extensions

Add helpers in `packages/backend/src/lib/s3.ts`:

- create multipart upload (`CreateMultipartUploadCommand`)
- presign `UploadPartCommand` per part
- complete multipart upload (`CompleteMultipartUploadCommand`)
- abort multipart upload (`AbortMultipartUploadCommand`)

### Validation and Safety

- Reuse current path normalization and entitlement checks.
- Validate `partNumber` range (`1..partCount`).
- Validate part list is strictly increasing and unique before complete.
- Validate `objectKey` belongs to `dockspaceId`.
- Keep overwrite semantics consistent with existing upload flow.

### Metadata Write

- `completeMultipartUpload` handler writes metadata via `upsertActiveFileByPath` after successful S3 completion.
- This replaces separate call to `/confirm-upload` for multipart path, avoiding an extra round trip.

## Frontend Implementation Details

### API Client

Add multipart methods in `apps/web/src/lib/dockspaceApi.ts`:

- `startMultipartUpload`
- `getMultipartPartUrls`
- `completeMultipartUpload`
- `abortMultipartUpload`

### Upload Strategy

In current upload logic (`uploadFile` path), add:

- `MULTIPART_THRESHOLD_BYTES` (for example `100 * 1024 * 1024`).
- branch:
  - small files -> existing `uploadFile` flow.
  - large files -> `uploadFileMultipart`.

### Multipart Runner

`uploadFileMultipart` behavior:

1. `Blob.slice` file into parts using backend `partSize`.
2. Upload with `PART_CONCURRENCY` (for example `4`).
3. Retry failed part up to `MAX_PART_RETRIES` (for example `3`) with backoff.
4. Capture `etag` from each part response.
5. Complete upload with all successful part etags.
6. Abort session if completion cannot proceed.

### UX

- Show aggregate progress for current large file.
- Show clear failure reason with option to retry the whole file.
- Keep existing behavior for regular files unchanged.

## Operational Considerations

- Add S3 lifecycle rule to abort incomplete multipart uploads automatically (for example after 1 day) to limit orphaned storage.
- Log upload lifecycle fields (`dockspaceId`, `fileNodeId`, `uploadId`, part counts, error category).
- Monitor 4xx/5xx rates for multipart handlers separately from current upload flow.

## Edge Cases

- Network drop mid-upload: retry part, do not restart entire file.
- Missing `etag` on part response: treat part as failed and retry.
- Complete called with missing part etags: reject with 400.
- Upload URL expiration mid-flight: request fresh part URLs for remaining parts.
- User overwrites existing file path: keep existing replace behavior.

## Testing Plan

### Backend Unit Tests

1. start handler validates input and returns expected session fields.
2. part-url handler rejects invalid part numbers and signs valid ones.
3. complete handler rejects duplicate/out-of-order parts.
4. complete handler writes metadata only after successful S3 completion.
5. abort handler handles idempotent abort calls safely.

### Frontend Unit Tests

1. strategy selection picks multipart above threshold.
2. part chunking creates correct part count and boundaries.
3. retry policy retries failed parts and eventually fails correctly.
4. completion payload includes sorted parts with etags.

### Integration / Manual

1. Upload a 1-2 GB test file on stable network.
2. Simulate intermittent failures and verify part retries.
3. Verify file appears in listing and is downloadable after completion.
4. Verify incomplete session cleanup behavior.

## Delivery Phases

1. Phase 1: backend multipart endpoints + S3 helper functions.
2. Phase 2: frontend multipart client and strategy branching.
3. Phase 3: progress/error UX and retry polish.
4. Phase 4: test suite expansion and manual large-file verification.

## Acceptance Criteria

- Files above configured threshold use multipart upload automatically.
- Multipart upload supports per-part retries and bounded concurrency.
- Completed uploads produce correct metadata and appear in listings.
- Abort path works and failed sessions do not leak indefinitely.
- Existing small-file upload flow remains unchanged and tests continue passing.
