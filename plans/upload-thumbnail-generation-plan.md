# Upload Thumbnail Generation Plan

## Goal

Generate and persist thumbnail metadata for every uploaded file (for both `GENERIC_FILES` and `PHOTOS_VIDEOS`) using `SQS -> Lambda`, with idempotency, exponential retry backoff, and a DLQ.

## Decision: Who Sends Messages To SQS

### Options Considered

1. Upload finalize lambdas (`confirmUpload`, `completeMultipartUpload`)
2. DynamoDB Stream on file metadata table
3. S3 ObjectCreated event

### Decision

Use **upload finalize lambdas** as the SQS producer.

### Why This Option

- It runs exactly where upload completion is already decided and metadata is written.
- It has full business context (`userId`, `dockspaceId`, `fileNodeId`, `s3Key`, `contentType`, `etag`) without extra lookups.
- It works uniformly for both dockspace types because both paths converge in finalize handlers.
- It avoids stream noise from non-upload file updates (rename/move/trash/restore).
- It avoids S3 event timing/orphan issues (events can occur before metadata is accepted, or for objects that should not become active records).

### Why Not The Other Options

- DynamoDB Stream:
  - Would require enabling streams and filtering many unrelated `FILE_NODE` updates.
  - Harder to avoid duplicate regeneration on metadata-only changes.
- S3 event:
  - Fires on object creation, not on application-level upload confirmation.
  - Can enqueue work for objects not accepted as active metadata.
  - Lacks direct user context and would require additional lookups.

## High-Level Architecture

1. `confirmUpload` and `completeMultipartUpload` enqueue a thumbnail job after successful metadata upsert.
2. SQS `ThumbnailJobsQueue` triggers `generateThumbnail` lambda.
3. Worker reads source object metadata/content from S3, generates thumbnail when supported, uploads thumbnail object to S3.
4. Worker writes thumbnail metadata to DynamoDB.
5. Worker is idempotent:
  - checks if matching thumbnail metadata already exists for the same source `etag`.
  - ignores stale jobs if current file metadata no longer matches job `etag`.
6. Retryable failures use explicit exponential backoff requeue.
7. Final failures go to `ThumbnailJobsDLQ`.

## Data Model

### New DynamoDB Item Type

- `type: THUMBNAIL_METADATA`
- `PK: U#{userId}#S#{dockspaceId}`
- `SK: T#L#{fileNodeId}`
- Attributes:
  - `fileNodeId`
  - `sourceS3Key`
  - `sourceEtag`
  - `sourceContentType`
  - `status: READY | UNSUPPORTED | FAILED`
  - `thumbnailKey` (when `READY`)
  - `thumbnailContentType` (for example `image/webp`)
  - `width`, `height`, `size`
  - `attempts`
  - `lastError` (for terminal failures)
  - `generatedAt`, `updatedAt`

This keeps thumbnail lifecycle separate from `FILE_NODE` mutations.

## Queue Message Contract

```json
{
  "version": 1,
  "jobType": "GENERATE_THUMBNAIL",
  "userId": "string",
  "dockspaceId": "string",
  "fileNodeId": "string",
  "s3Key": "string",
  "contentType": "string",
  "etag": "string",
  "attempt": 1,
  "requestedAt": "ISO-8601"
}
```

## Idempotency Rules

1. Read current `FILE_NODE` by `fileNodeId`.
2. If file is missing, trashed, or purged: ack as no-op.
3. If `FILE_NODE.etag !== message.etag`: ack as stale job (newer upload already exists).
4. Read `THUMBNAIL_METADATA`:
  - if `status=READY` and `sourceEtag` matches message `etag`, ack immediately.
5. Only then generate/upload thumbnail and upsert `THUMBNAIL_METADATA`.

## Retry / Backoff / DLQ

### Retryable vs Non-Retryable

- Non-retryable:
  - unsupported file type (write metadata `UNSUPPORTED`, ack)
  - stale/missing source (ack)
  - invalid message shape (send to DLQ)
- Retryable:
  - S3 transient errors
  - image/video processing transient failures
  - DynamoDB throttling/transient failures

### Exponential Backoff

- Worker handles retryable errors by re-enqueuing same job with incremented `attempt` and delay:
  - `delaySeconds = min(2^(attempt-1) * 30, 900)`
- `MAX_ATTEMPTS = 8` (example).
- When attempts exceed max, send payload + error info to `ThumbnailJobsDLQ`.

### Infrastructure Guardrails

- Queue visibility timeout >= 6x lambda timeout.
- DLQ redrive policy still enabled as fallback for unhandled crashes/timeouts.

## Thumbnail Generation Strategy

### Supported Initially

- `image/*`: generate resized thumbnail (for example max 512x512, keep aspect ratio, output WebP).
- `video/*`:
  - extract a representative frame (for example at 1s) and encode as WebP.

### Unsupported

- For non-image/video MIME types, mark metadata `UNSUPPORTED` (idempotent terminal state).
- This still satisfies "processed for all uploads" while avoiding infinite retries.

## S3 Key Strategy For Thumbnails

- Source key remains unchanged: `{dockspaceId}/{fileNodeId}`
- Thumbnail key:
  - `thumbnails/{dockspaceId}/{fileNodeId}/v-{etag-normalized}.webp`

Using source `etag` in key prevents collisions across overwrites and enables stale-job safety.

## Implementation Plan

### Phase 1: Infra (CDK)

Files:
- `infra/cdk/src/stacks/backend-stack.ts`

Changes:
- Add `ThumbnailJobsQueue` and `ThumbnailJobsDLQ`.
- Add `generateThumbnail` lambda.
- Add SQS event source mapping to worker lambda.
- Grant:
  - producer lambdas permission to `sqs:SendMessage`.
  - worker lambda `s3:GetObject`, `s3:PutObject`, `dynamodb:GetItem/PutItem/UpdateItem`.
- Add env vars:
  - `THUMBNAIL_QUEUE_URL`
  - `THUMBNAIL_DLQ_URL`
  - `THUMBNAIL_MAX_ATTEMPTS`

### Phase 2: Producer Wiring

Files:
- `packages/backend/src/handlers/confirmUpload.ts`
- `packages/backend/src/handlers/completeMultipartUpload.ts`
- `packages/backend/src/lib/thumbnailQueue.ts` (new)

Changes:
- After successful `upsertActiveFileByPath`, enqueue thumbnail job.
- Use shared helper for consistent payload.
- Keep enqueue idempotent and non-blocking from duplicate sends (consumer handles duplicates safely).

### Phase 3: Worker + Metadata Repository

Files:
- `packages/backend/src/handlers/generateThumbnail.ts` (new)
- `packages/backend/src/lib/repository.ts`
- `packages/backend/src/types/models.ts`
- `packages/backend/src/domain/keys.ts`
- `packages/backend/src/lib/s3.ts`
- `packages/backend/package.json`

Changes:
- Add thumbnail metadata model + key builder.
- Add repository helpers:
  - `getThumbnailMetadata`
  - `upsertThumbnailMetadata`
- Add S3 helpers for:
  - reading source object stream
  - uploading thumbnail object
- Add image/video processing dependencies and implementation.
- Implement retry classification and exponential requeue logic.

### Phase 4: Read APIs (Optional but Recommended)

Files:
- `packages/backend/src/handlers/listMedia.ts`
- `packages/backend/src/handlers/listFolderChildren.ts` (if file-level payload expansion is planned)
- `apps/web/src/lib/apiTypes.ts`

Changes:
- Expose `thumbnail` fields in media/file listing payloads so UI can render generated thumbnails.

### Phase 5: Tests

Files:
- `packages/backend/src/tests/*` (new tests)

Tests:
1. Producer enqueues job from both finalize handlers.
2. Worker no-ops when matching thumbnail metadata exists (idempotent).
3. Worker no-ops stale message when `etag` changed.
4. Worker writes `READY` metadata for supported type.
5. Worker writes `UNSUPPORTED` metadata for unsupported type.
6. Retryable failure requeues with exponential delay.
7. Max attempts routes message to DLQ.

## Operational Considerations

- Metrics:
  - queue depth
  - age of oldest message
  - worker success/failure counts
  - retries and DLQ count
- Structured logs must include:
  - `userId`, `dockspaceId`, `fileNodeId`, `s3Key`, `etag`, `attempt`.
- Add alarm on DLQ message count > 0.

## Risks and Mitigations

- Native video thumbnailing in Lambda can require larger binaries and memory.
  - Mitigation: start with image support first, keep video behind feature flag if packaging is heavy.
- Missed enqueue due to producer failure after metadata write.
  - Mitigation: add a periodic reconciliation job later to scan recent files missing thumbnail metadata.

## Acceptance Criteria

- Every successful upload finalize path enqueues thumbnail work.
- Thumbnail generation pipeline works for both dockspace types.
- Duplicate/stale messages do not regenerate or overwrite newer thumbnails.
- Retries use exponential backoff and terminal failures land in DLQ.
- Thumbnail metadata exists with terminal status (`READY` or `UNSUPPORTED`) for processed uploads.
