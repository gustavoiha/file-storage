# Dockspace - File Storage - System Design

**Single-Tenant, Multi-Dockspace Cloud File Storage**

---

## 1. Purpose

Dockspace is a self-hosted, single-tenant cloud file storage system comparable to a minimal Google Drive. It supports:

* Multiple dockspaces per user
* Folder-based organization
* Soft deletion with a trash period
* Verified purging of deleted files

The system is designed for personal use and open-source redistribution. Each deployment runs in a single AWS account, which defines the tenant boundary.

---

## 2. Core Principles

* Single tenant per deployment
* One S3 bucket per environment
* Deterministic file paths
* DynamoDB as the source of truth for metadata
* S3 lifecycle manages physical deletion
* Lambda handles control-plane logic only
* Exactly one DynamoDB GSI
* `PURGED` strictly means “object is confirmed gone from S3”

---

## 3. High-Level Architecture

### Frontend

* TypeScript + React SPA
* Hosted on S3 behind CloudFront (OAC enabled)
* Cognito User Pool for authentication
* Communicates only with API Gateway

### Backend

* API Gateway (REST or HTTP)
* Lambda functions for:

  * Metadata CRUD
  * Folder listing
  * Presigned URL generation
  * Restore operations
* Scheduled Lambda (daily) for purge reconciliation

### Storage

* S3: file contents
* DynamoDB: metadata and state
* Cognito: identity

---

## 4. S3 Design

### Bucket

* Single private bucket
* Block Public Access enabled
* Versioning enabled

### Object Key Format

```
{dockspaceId}/{fileNodeId}
```

Rules:

* No path or folder directory information in the S3 object key.
* Object's key is immutable.
* Renaming or moving a file means updating the DynamoDB metadata, not the object's S3 key.

### Tags

* Active file: no `state` tag or `state=ACTIVE`
* Trashed file: `state=TRASH`

### Lifecycle Rule

* Filter: tag `state=TRASH`
* Expiration: 30 days for current version (creates delete marker in versioned buckets)
* Noncurrent version expiration for `state=TRASH`: 30 days
* Global noncurrent version expiration: 90 days
* Expired delete marker cleanup enabled

Lifecycle timing is approximate; correctness is enforced via reconciliation.

---

## 5. DynamoDB Table

Single table, on-demand capacity.

### Key Identifier Mapping

* `U` = user
* `S` = dockspace
* `F` = folder node
* `L` = file node
* `D` = directory

### File Node Record

```
PK = U#{userId}#S#{dockspaceId}
SK = L#{fileNodeId}
```

Attributes:

* `type = FILE_NODE`
* `parentFolderNodeId`
* `s3Key`
* `name`
* `size`
* `createdAt`
* `updatedAt`
* `contentType`
* `etag`
* `deletedAt`
* `flaggedForDeleteAt`
* `purgedAt`

Each file node gets a UUID at creation. PK/SK is path-agnostic.

### Folder Node Record

```
PK = U#{userId}#S#{dockspaceId}
SK = F#{folderNodeId}
```

Attributes:

* `type = FOLDER_NODE`
* `parentFolderNodeId`
* `name`
* `createdAt`
* `updatedAt`

### Directory Record

```
PK = U#{userId}#S#{dockspaceId}
SK = D#{folderNodeId}#{kind}#{normalizedName}#{id}
```

Where:

* `kind` = `L` (file) or `F` (folder)
* `id` = `fileNodeId` or `folderNodeId`

Attributes:

* `type = DIRECTORY`
* `name`
* `normalizedName`
* `childId`
* `childType` (`file` or `folder`)
* `parentFolderNodeId`
* `createdAt`
* `updatedAt`

### Dockspace Items (Same Table)

```
PK = U#{userId}
SK = S#{dockspaceId}

type: "DOCKSPACE"
name
createdAt
```

---

## 6. Directory-Driven Listing

Folder and file listing is resolved through `D#...` records.

* Listing a folder queries:
  * `PK = U#{userId}#S#{dockspaceId}`
  * `begins_with(SK, D#{folderNodeId}#L#)`
* Resolving nested folders traverses:
  * `D#{folderNodeId}#F#{normalizedName}#{childId}`

---

## 7. Access Patterns

### List Active Files in a Folder

1. Resolve folder path to `folderNodeId` by walking directory folder entries (`kind=F`)
2. Query `D#{folderNodeId}#L#...`
3. Load `L#{fileNodeId}` records

### Trash View

Query file nodes (`L#`) under dockspace PK and filter where:

* `deletedAt` exists
* `purgedAt` does not exist

### Purged History

Query file nodes (`L#`) under dockspace PK and filter where:

* `purgedAt` exists

### Get File Metadata by Path (Active)

1. Resolve parent folder path to `folderNodeId`
2. Resolve directory entry by normalized file name (`kind=L`)
3. Read `L#{fileNodeId}`

---

## 8. Upload Flow

1. Client requests upload session from API
2. Lambda:

   * Validates target path
   * Generates presigned PUT or multipart upload URLs
3. Client uploads directly to S3
4. Client confirms upload
5. Lambda writes metadata item:

   * `state = ACTIVE`
   * `etag` recorded

No file bytes pass through Lambda or API Gateway.

---

## 9. Delete (Move to Trash)

User deletes a file.

Steps:

1. DynamoDB Update:

   * `state = TRASH`
   * `deletedAt = now`
   * `flaggedForDeleteAt = now + 30 days`
2. S3:

   * Apply tag `state=TRASH`

File remains accessible only via Trash UI.

---

## 10. Restore from Trash

Steps:

1. DynamoDB conditional update:

   * `state` must be `TRASH`
   * Set `state = ACTIVE`
   * Clear `deletedAt` and `flaggedForDeleteAt`
2. S3:

   * Remove `state=TRASH` tag (or set `state=ACTIVE`)

If the object no longer exists, restore fails and the item should be transitioned to `PURGED`.
If only the current version is unavailable but older versions still exist, restore fails and item remains in `TRASH`.

---

## 11. Purge Reconciliation (Scheduled Lambda)

Runs daily.

Algorithm:

1. Query GSI1 (paginated):

   * `GSI1PK = "PURGE_DUE"`
   * `GSI1SK <= "{nowIso}#~"`
2. For each due item:

   * List and delete all S3 versions and delete markers for the key
   * Re-list versions for the key
   * Only when no versions remain:

     * DynamoDB conditional update:

       * `state` must still be `TRASH`
       * Set `state = PURGED`
       * Set `purgedAt = now`

Guarantee:

* `PURGED` means object is actually gone from S3.

---

## 12. Rename / Move

Use DynamoDB `TransactWriteItems` so node and directory records remain consistent.

### Rename File Node (authoritative `L#{fileNodeId}`)

* Delete `D#rootFolderNodeId#L#fileNormalizedName.txt#{fileNodeId}`
* Put `D#rootFolderNodeId#L#newFileNormalizedName.txt#{fileNodeId}`
* Update `L#{fileNodeId}` name

### Move `rio.jpg` from `f_2026` to `f_photos`

* Update `L#file_1` `parentFolderNodeId`
* Delete `D#f_2026#L#rio.jpg#file_1`
* Put `D#f_photos#L#rio.jpg#file_1`

The same transaction pattern is used for upload-confirm, trash, and restore flows.

---

## 13. Multi-Dockspace Support

* Dockspaces are logical containers
* No cross-dockspace listing
* Dockspace membership is implicit (single user)

Future sharing can be added via new item types without schema changes.

---

## 14. Security Guarantees

* S3 bucket is private
* Access via presigned URLs only
* Cognito-authenticated API access
* IAM scoped to:

  * Specific bucket
  * Prefix `{userId}/dockspaces/*`

---

## 15. Explicit Non-Goals

* No multi-tenant SaaS model
* No cross-user sharing
* No server-side ZIP downloads
* No automatic metadata hard deletion

---

## 16. Invariants

* `PURGED` implies object absence (verified)
* `ACTIVE` implies no TRASH lifecycle tag
* Restore always clears lifecycle-relevant tags
* File node keys are path-agnostic (`L#{fileNodeId}`)
* `fullPath` normalization is strict and centralized

---

## 17. Authorization Setup (Allowlist + Entitlement Group)

Dockspace supports signup allowlisting and runtime entitlement checks:

* Signup is allowed only when the email exists in an SSM `StringList` allowlist
* API access is allowed only for users in the Cognito group `entitled-users`

### Required SSM Parameter

Create this parameter before first production signup:

* Name: `/dockspace/auth/allowed-signup-emails`
* Type: `StringList`
* Value example: `you@example.com`

---

### Onboarding a User

1. Add the email to `/dockspace/auth/allowed-signup-emails`
2. User signs up and confirms email
3. Post-confirmation trigger adds the user to `entitled-users`
4. User can access dockspace/file APIs

### Revoking Access

1. Remove user from Cognito group `entitled-users` to block API access
2. Optionally remove email from SSM allowlist to block future signups

---

## 18. One-Time Backfill For Purge GSI

When introducing purge-due indexing for already-trashed records, run this one-time backfill:

```bash
TABLE_NAME=<your-table-name> \
BACKFILL_DRY_RUN=true \
npm run --workspace @dockspace/backend backfill:purge-gsi
```

Then execute the write run:

```bash
TABLE_NAME=<your-table-name> \
BACKFILL_DRY_RUN=false \
npm run --workspace @dockspace/backend backfill:purge-gsi
```

Optional controls:

* `BACKFILL_PAGE_SIZE` (default `200`)
* `BACKFILL_MAX_PAGES` (unset by default; process all pages)

---

## 19. One-Time Backfill For Trash/Purged State Index

When introducing `FILE_STATE_INDEX` records (`X#TRASH#...` / `X#PURGED#...`), run:

```bash
TABLE_NAME=<your-table-name> \
BACKFILL_DRY_RUN=true \
npm run --workspace @dockspace/backend backfill:file-state-index
```

Then execute the write run:

```bash
TABLE_NAME=<your-table-name> \
BACKFILL_DRY_RUN=false \
npm run --workspace @dockspace/backend backfill:file-state-index
```

Optional controls:

* `BACKFILL_PAGE_SIZE` (default `200`)
* `BACKFILL_MAX_PAGES` (unset by default; process all pages)

---

## 20. One-Time Backfill For Dockspace Metrics

When introducing `DOCKSPACE_METRICS` records (`M#S#{dockspaceId}`), run:

```bash
TABLE_NAME=<your-table-name> \
BACKFILL_DRY_RUN=true \
npm run --workspace @dockspace/backend backfill:dockspace-metrics
```

Then execute the write run:

```bash
TABLE_NAME=<your-table-name> \
BACKFILL_DRY_RUN=false \
npm run --workspace @dockspace/backend backfill:dockspace-metrics
```

Optional controls:

* `BACKFILL_PAGE_SIZE` (default `100`)
* `BACKFILL_MAX_PAGES` (unset by default; process all pages)

---

## 21. One-Time Backfill For File Content Hash

When introducing `contentHash` on uploaded file nodes, run:

```bash
TABLE_NAME=<your-table-name> \
BUCKET_NAME=<your-bucket-name> \
BACKFILL_DRY_RUN=true \
npm run --workspace @dockspace/backend backfill:file-content-hash
```

Then execute the write run:

```bash
TABLE_NAME=<your-table-name> \
BUCKET_NAME=<your-bucket-name> \
BACKFILL_DRY_RUN=false \
npm run --workspace @dockspace/backend backfill:file-content-hash
```

Optional controls:

* `BACKFILL_PAGE_SIZE` (default `100`)
* `BACKFILL_MAX_PAGES` (unset by default; process all pages)
