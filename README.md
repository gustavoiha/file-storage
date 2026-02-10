# ArticVault - File Storage - System Design

**Single-Tenant, Multi-Vault Cloud File Storage**

---

## 1. Purpose

ArticVault is a self-hosted, single-tenant cloud file storage system comparable to a minimal Google Drive. It supports:

* Multiple vaults per user
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
* No versioning (MVP)

### Object Key Format

```
{userId}/vaults/{vaultId}/files/{relativePath}
```

Rules:

* `relativePath` never starts with `/`
* Folder hierarchy is implicit via prefixes
* No folder marker objects

Example:

```
gus/vaults/8f3a92/files/photos/2026/img1.jpg
```

### Tags

* Active file: no `state` tag or `state=ACTIVE`
* Trashed file: `state=TRASH`

### Lifecycle Rule

* Filter: tag `state=TRASH`
* Expiration: 30 days

Lifecycle timing is approximate; correctness is enforced via reconciliation.

---

## 5. DynamoDB Table

Single table, on-demand capacity.

### Key Identifier Mapping

* `U` = user
* `V` = vault
* `F` = folder node
* `L` = file node
* `D` = directory

### File Node Record

```
PK = U#{userId}#V#{vaultId}
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
PK = U#{userId}#V#{vaultId}
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
PK = U#{userId}#V#{vaultId}
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

### Vault Items (Same Table)

```
PK = U#{userId}
SK = V#{vaultId}

type: "VAULT"
name
createdAt
```

---

## 6. Directory-Driven Listing

Folder and file listing is resolved through `D#...` records.

* Listing a folder queries:
  * `PK = U#{userId}#V#{vaultId}`
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

Query file nodes (`L#`) under vault PK and filter where:

* `deletedAt` exists
* `purgedAt` does not exist

### Purged History

Query file nodes (`L#`) under vault PK and filter where:

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

---

## 11. Purge Reconciliation (Scheduled Lambda)

Runs daily.

Algorithm (per vault):

1. Query GSI1:

   * `begins_with(GSI1SK, S#TRASH#T#)`
   * Stop when `flaggedForDeleteAt > now`
2. For each eligible item:

   * `HEAD` the S3 object

     * If object exists → skip
     * If object does not exist:

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

## 13. Multi-Vault Support

* Vaults are logical containers
* No cross-vault listing
* Vault membership is implicit (single user)

Future sharing can be added via new item types without schema changes.

---

## 14. Security Guarantees

* S3 bucket is private
* Access via presigned URLs only
* Cognito-authenticated API access
* IAM scoped to:

  * Specific bucket
  * Prefix `{userId}/vaults/*`

---

## 15. Explicit Non-Goals

* No multi-tenant SaaS model
* No cross-user sharing
* No object versioning
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

ArticVault supports signup allowlisting and runtime entitlement checks:

* Signup is allowed only when the email exists in an SSM `StringList` allowlist
* API access is allowed only for users in the Cognito group `entitled-users`

### Required SSM Parameter

Create this parameter before first production signup:

* Name: `/articvault/auth/allowed-signup-emails`
* Type: `StringList`
* Value example: `you@example.com`

### Onboarding a User

1. Add the email to `/articvault/auth/allowed-signup-emails`
2. User signs up and confirms email
3. Post-confirmation trigger adds the user to `entitled-users`
4. User can access vault/file APIs

### Revoking Access

1. Remove user from Cognito group `entitled-users` to block API access
2. Optionally remove email from SSM allowlist to block future signups
