# Dockspace Types And Media Album Plan (High Level)

## Objective

Support different dockspace kinds, each optimized for a file collection domain, starting with:

- `GENERIC_FILES` dockspace
- `PHOTOS_VIDEOS` dockspace

`PHOTOS_VIDEOS` dockspaces must:
- accept only photo/video media uploads,
- keep the same core file lifecycle model used by other dockspaces,
- render with a folderless, album-oriented UI,
- support album assignment where one media item can belong to multiple albums,
- support viewing all content together or grouped by albums.

The design should be extensible for future categories.

## Product Behavior

1. User chooses a dockspace type when creating a dockspace.
2. The selected type controls:
   - allowed upload content types,
   - primary UI experience for browsing content.
3. In a `PHOTOS_VIDEOS` dockspace:
   - unsupported file types are blocked before upload and by backend validation,
   - folder navigation is not shown in UI,
   - content can be browsed in `All Media` view,
   - content can also be browsed by albums,
   - a photo/video can be assigned to multiple albums at once.
4. In a `GENERIC_FILES` dockspace:
   - current folder/file browser behavior remains unchanged.

## Core Domain Distinction

Shared core lifecycle layer (all dockspace types):
- same file object + metadata lifecycle states (`ACTIVE`, `TRASHED`, `PURGED`),
- same trash/restore/purge semantics,
- same upload, storage, and entitlement/security foundations.

`GENERIC_FILES`:
- hierarchical folder ownership model (one location in folder tree).

`PHOTOS_VIDEOS`:
- media library + album membership model (many-to-many).
- albums are logical collections, not storage locations.
- album membership does not move/copy file storage objects.
- folders are not part of the user-facing media navigation model.

## Data Model

### Dockspace type

Extend dockspace metadata:
- `dockspaceType`: enum (`GENERIC_FILES | PHOTOS_VIDEOS`)
- optional `features` object for future capability flags.

Migration rule:
- existing dockspaces default to `GENERIC_FILES`.

### Album entities (media dockspaces)

Introduce album records and membership records.

Album record:
- `PK = U#{userId}#S#{dockspaceId}`
- `SK = A#{albumId}`
- `type = ALBUM`
- `albumId`, `name`, `createdAt`, `updatedAt`

Membership record (album -> media):
- `PK = U#{userId}#S#{dockspaceId}`
- `SK = AM#{albumId}#L#{fileNodeId}`
- `type = ALBUM_MEMBERSHIP`
- `albumId`, `fileNodeId`, `createdAt`

Reverse membership record (media -> album) for efficient lookup and cleanup:
- `PK = U#{userId}#S#{dockspaceId}`
- `SK = MA#{fileNodeId}#A#{albumId}`
- `type = MEDIA_ALBUM_LINK`
- `albumId`, `fileNodeId`, `createdAt`

Notes:
- Dual-record strategy keeps queries cheap in both directions.
- Membership uniqueness enforced by deterministic keys.

## API Changes

### Dockspace create/list

- Extend create payload with `dockspaceType`.
- Return `dockspaceType` in list/get responses.

### Upload policy by type

For `PHOTOS_VIDEOS` dockspaces:
- validate upload MIME types in backend (`image/*`, `video/*` policy with optional extension checks).
- reject unsupported types with clear error.

### Album APIs (media dockspaces)

Add endpoints (high level):
- `POST /dockspaces/{dockspaceId}/albums` (create album)
- `GET /dockspaces/{dockspaceId}/albums` (list albums)
- `PATCH /dockspaces/{dockspaceId}/albums/{albumId}` (rename)
- `DELETE /dockspaces/{dockspaceId}/albums/{albumId}` (delete album)
- `POST /dockspaces/{dockspaceId}/albums/{albumId}/media` (assign media ids)
- `DELETE /dockspaces/{dockspaceId}/albums/{albumId}/media/{fileNodeId}` (remove membership)
- `GET /dockspaces/{dockspaceId}/albums/{albumId}/media` (list media in album)
- `GET /dockspaces/{dockspaceId}/media/{fileNodeId}/albums` (list albums for a media item)

## Query/View Model

### All Media view

- List all active media items in dockspace (independent of album memberships).
- No folder hierarchy or folder breadcrumbs are rendered in media dockspace UI.

### Albums view

- List albums with optional counts.
- Open album to list its media via membership records.

### Grouped by album

- UI mode that renders album sections with media previews while still allowing access to `All Media`.

## Frontend UX Changes

### Dockspace creation

- Add dockspace type selector with concise descriptions.

### Type-based routing

- `GENERIC_FILES` -> existing file browser page.
- `PHOTOS_VIDEOS` -> media workspace page with tabs/views:
  - `All Media`
  - `Albums`
  - `Grouped` (optional initial release, can start with All Media + Albums).
  - no folder tree, folder breadcrumb, or move-to-folder controls in this surface.

### Media interactions (initial)

- grid layout with thumbnails,
- photo/video preview,
- assign/remove albums for selected media,
- filter by album,
- indicator chips showing album memberships on media cards (or in detail panel).

## State Transition Rules

### Trash / Purge interactions

- Trashing media does not delete album records.
- Trashing media should remove or logically ignore its album memberships in active views.
- Purging media must remove reverse/forward membership records to avoid orphan links.

### Restore interactions

- On restore, media returns to active library.
- Membership restoration policy options:
  - preserve memberships if links were soft-kept, or
  - require re-assignment if links were removed at trash time.

Recommended initial policy:
- remove memberships at trash time for simpler active queries; restore does not auto-recreate memberships.

## Compatibility And Migration

1. Deploy dockspace type support with default `GENERIC_FILES`.
2. Backfill existing dockspaces with default type.
3. Deploy media type upload policy checks.
4. Deploy album model + APIs.
5. Deploy media UI with album assignment and all-content/album views.

## Testing (High Level)

### Backend

1. Create dockspace persists valid type and rejects invalid type.
2. Media dockspace upload endpoints reject non-media types.
3. Album CRUD and membership operations validate dockspace type.
4. Membership uniqueness and deletion behavior are deterministic.
5. Trash/purge/restore interactions do not leave orphan membership records.

### Frontend

1. Type selector is sent on create dockspace.
2. Media dockspace routes to media workspace.
3. Media workspace does not render folder navigation controls.
4. Album assignment supports one media item in multiple albums.
5. User can switch between all-content and album-scoped views.

## Rollout Phases

1. Dockspace type model and create/list API support.
2. Media upload policy enforcement.
3. Album data model + album/membership APIs.
4. Media workspace UI (All Media + Albums + assignment flow).
5. Trash/purge consistency handling for album memberships.

## Acceptance Criteria

- Dockspaces can be created with type.
- `PHOTOS_VIDEOS` dockspaces enforce media-only uploads.
- A photo/video can belong to multiple albums simultaneously.
- Users can browse all media at once or grouped by album.
- `PHOTOS_VIDEOS` dockspaces do not expose folders in UI.
- `GENERIC_FILES` behavior remains unchanged.
- Architecture supports adding future dockspace categories and media features without major rewrites.
