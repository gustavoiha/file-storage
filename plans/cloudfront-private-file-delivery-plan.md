# CloudFront Private File Delivery Plan

## Goal

Add a dedicated CloudFront distribution in front of the private file S3 bucket for read/caching, using:

- CloudFront OAC to protect S3 origin access
- API-based authentication/authorization
- short-lived CloudFront signed URLs (per object)

This removes the need for Lambda@Edge authorization on every file request.

## Current Baseline

- File objects are currently read through backend-issued S3 presigned URLs.
- Bucket is private (public access blocked), but reads bypass CloudFront caching.
- API already authenticates Cognito users and authorizes dockspace access using DynamoDB.

## Required Path Scope

The design must cover all object paths under:

- `/{dockspaceId}/*`

This explicitly includes:

- `/{dockspaceId}/{fileId}`
- `/{dockspaceId}/thumbnails/{fileId}` (and any thumbnail variants under this prefix)

## Recommended Architecture (Default)

1. Client requests a download/view session from API.
2. API validates JWT, extracts Cognito `sub`, and authorizes `dockspaceId` access from DynamoDB.
3. API mints a short-lived CloudFront signed URL for the specific object path.
4. Client fetches object via CloudFront URL.
5. CloudFront validates signature, serves from cache if present, otherwise fetches from S3 via OAC.

Authorization stays centralized in the API, while CloudFront enforces signed URL validity.

## Security Model

### Authorization source of truth

- DynamoDB dockspace ownership keyed by Cognito `sub`.
- API authorizes each requested object by dockspace before signing.

### URL scope and lifetime

- Sign only one object path per URL (per-object URL).
- Keep TTL short (for example 5-15 minutes).
- Do not mint wildcard URLs for `/{dockspaceId}/*` in normal operation.

### Origin protection

- S3 bucket remains non-public.
- CloudFront distribution uses OAC.
- Bucket policy grants `s3:GetObject` only to the CloudFront distribution via `AWS:SourceArn`.

## Caching Behavior

- Enable CloudFront caching for object payloads.
- Keep cache key path-based; avoid including signing query params in the cache key to prevent cache fragmentation.
- Support `GET`/`HEAD` and byte-range requests for media and document previews.
- Suggested starting TTLs:
  - `defaultTtl`: 1 day
  - `maxTtl`: 1 week
  - `minTtl`: 0

## CDK Implementation Plan

## 1) Add dedicated file distribution

- File: `/Users/gustavoiha/Personal/file-storage/infra/cdk/src/stacks/storage-stack.ts` (or a dedicated file-delivery stack).
- Configure:
  - S3 origin with OAC
  - behavior for file delivery (distribution can be file-only, with default behavior)
  - cache and origin request policies aligned with signed URL strategy
- Export:
  - distribution domain name
  - distribution id

## 2) Add CloudFront signed URL trust config

- Create CloudFront `PublicKey` + `KeyGroup`.
- Attach `trustedKeyGroups` to file behavior.
- Keep signer private key in SSM SecureString or Secrets Manager.

## 3) Wire backend signer configuration

- File: `/Users/gustavoiha/Personal/file-storage/infra/cdk/src/stacks/backend-stack.ts`
- Add env vars for download-session Lambda:
  - `FILE_CDN_DOMAIN`
  - `FILE_CDN_KEY_PAIR_ID` (or public key id/key group inputs required by signer flow)
  - `FILE_CDN_PRIVATE_KEY_SECRET_ID` (or parameter name)

## Backend / API Implementation Plan

## 4) Add CloudFront signer helper

- New file: `/Users/gustavoiha/Personal/file-storage/packages/backend/src/lib/cdn.ts`
- Use `@aws-sdk/cloudfront-signer`.
- Input: object path and expiration.
- Output: signed CloudFront URL for one object.

## 5) Update download/session endpoints

- File: `/Users/gustavoiha/Personal/file-storage/packages/backend/src/handlers/createDownloadSession.ts`
- Keep existing auth checks:
  - authenticated user from JWT
  - authorize dockspace access via DynamoDB for `sub`
  - authorize file existence/readability
- Replace S3 presigned URL generation with CloudFront signed URL generation.
- Keep response payload with `downloadUrl` and expiry metadata.

## 6) Thumbnail URL signing

- Apply same authorization and signing pattern to thumbnail reads:
  - object path format `/{dockspaceId}/thumbnails/{fileId}...`
- Ensure API signs thumbnail object URLs only after dockspace authorization.

## Frontend Impact

- File: `/Users/gustavoiha/Personal/file-storage/apps/web/src/lib/dockspaceApi.ts`
- Keep API-driven read flow, but consume CloudFront signed URLs returned by API.
- No need to send auth headers directly to CloudFront, because access is via signed URL.

## Observability / Ops

- API logs for signing:
  - `sub` (or hashed), `dockspaceId`, object path, decision allow/deny, URL expiry.
- CloudFront metrics/alarms:
  - 4xx/5xx rate
  - cache hit ratio
  - origin request volume
- Optional audit metric:
  - signed URL mint rate by endpoint/path category (`file`, `thumbnail`)

## Rollout Plan

1. Deploy CloudFront file distribution + OAC + key group/public key.
2. Deploy backend signer helper and switch session endpoints to CloudFront signed URLs.
3. Validate in staging:
   - authorized reads succeed for both file and thumbnail paths
   - unauthorized users cannot obtain signed URLs
   - direct S3 access remains blocked
   - repeated reads hit CloudFront cache
4. Roll to production as direct cutover.

## Test Plan

### Unit

1. Signer helper produces valid per-object URLs with expected expiry.
2. Authorization tests:
   - invalid/expired JWT denied
   - user without dockspace access denied
   - user with access receives signed URL
3. Path handling tests for:
   - `/{dockspaceId}/{fileId}`
   - `/{dockspaceId}/thumbnails/{fileId}...`

### Integration

1. End-to-end read via signed CloudFront URL for file and thumbnail objects.
2. Expired signed URL is rejected by CloudFront.
3. Object remains inaccessible through direct S3 URL.

## Risks and Mitigations

- Risk: private key compromise.
  - Mitigation: managed secret storage, strict IAM, key rotation, short URL TTL.
- Risk: cache fragmentation if signed URL params are part of cache key.
  - Mitigation: set cache policy to ignore signing query params in cache key.
- Risk: high API load for frequent URL minting.
  - Mitigation: small client-side reuse window within URL TTL and endpoint performance tuning.

## Alternative (Not Default)

Lambda@Edge per-request authorization with DynamoDB checks is possible but not default due to additional complexity and per-request edge compute/data lookups.
