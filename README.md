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

### Primary Key (Files)

```
PK = U#{userId}#V#{vaultId}
SK = P#{fullPath}
```

* `fullPath` always starts with `/`
* `SK` is immutable

### File Item Attributes

```
type: "FILE"
state: "ACTIVE" | "TRASH" | "PURGED"

createdAt
updatedAt

size
contentType
etag

deletedAt           (TRASH only)
flaggedForDeleteAt  (deletedAt + 30 days)
purgedAt            (PURGED only)
```

### Vault Items (Same Table)

```
PK = U#{userId}
SK = VAULT#{vaultId}

type: "VAULT"
name
createdAt
```

---

## 6. Global Secondary Index (Single GSI)

### Purpose

* List files by state
* Folder browsing
* Trash view
* Efficient purge reconciliation

### Index Definition

```
GSI1PK = U#{userId}#V#{vaultId}

GSI1SK:
  ACTIVE → S#ACTIVE#P#{fullPath}
  PURGED → S#PURGED#P#{fullPath}
  TRASH  → S#TRASH#T#{flaggedForDeleteAt}#P#{fullPath}
```

Rationale:

* ACTIVE and PURGED sorted by path
* TRASH sorted by scheduled deletion time, then path
* Enables time-ordered purge queries without extra indexes

---

## 7. Access Patterns

### List Active Files in a Folder

Query GSI1:

* `GSI1PK = U#{userId}#V#{vaultId}`
* `begins_with(GSI1SK, S#ACTIVE#P#{folderPrefix})`

### Trash View

Query GSI1:

* `begins_with(GSI1SK, S#TRASH#)`

### Purged History

Query GSI1:

* `begins_with(GSI1SK, S#PURGED#)`

### Get File Metadata by Path

GetItem:

* `PK = U#{userId}#V#{vaultId}`
* `SK = P#{fullPath}`

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

Because `SK` is immutable:

1. Copy S3 object to new key
2. Create new DynamoDB item with new `SK`
3. Soft-delete old item (TRASH) or mark redirected
4. Tag old S3 object as needed

Atomic rename is not required.

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
* `SK` (path) is immutable per item
* `fullPath` normalization is strict and centralized
