import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from 'react';
import { Link } from '@tanstack/react-router';
import { Film, Image as ImageIcon } from 'lucide-react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { FileViewerDialog } from '@/components/files/FileViewerDialog';
import { UploadStagingList } from '@/components/files/UploadStagingList';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { useMoveToTrash, useUploadFile } from '@/hooks/useFiles';
import { useDockspaceUploadDialog } from '@/hooks/useDockspaceUploadDialog';
import {
  useAlbumMedia,
  useAlbums,
  useAssignAlbumMedia,
  useCreateAlbum,
  useDeleteAlbum,
  useMediaAlbums,
  useMediaFiles,
  useRemoveAlbumMedia,
  useRenameAlbum
} from '@/hooks/useMedia';
import { ApiError } from '@/lib/apiClient';
import type { FileRecord, MediaFileRecord } from '@/lib/apiTypes';

interface DockspaceMediaPageProps {
  dockspaceId: string;
  dockspaceName: string;
}

type MediaViewTab = 'all' | 'albums';

const bytesFormatter = new Intl.NumberFormat('en-US');
const timestampFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC'
});

const basename = (fullPath: string): string => {
  const segments = fullPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? fullPath;
};

const formatBytes = (value: number): string => `${bytesFormatter.format(value)} bytes`;

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return timestampFormatter.format(date);
};

const isMediaFile = (file: File): boolean =>
  file.type.startsWith('image/') || file.type.startsWith('video/');

export const DockspaceMediaPage = ({ dockspaceId, dockspaceName }: DockspaceMediaPageProps) => {
  const [activeTab, setActiveTab] = useState<MediaViewTab>('all');
  const [albumFilterId, setAlbumFilterId] = useState('');
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [viewerFile, setViewerFile] = useState<FileRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mediaQuery = useMediaFiles(dockspaceId);
  const albumsQuery = useAlbums(dockspaceId);
  const filteredAlbumMediaQuery = useAlbumMedia(dockspaceId, albumFilterId || null);
  const selectedAlbumMediaQuery = useAlbumMedia(dockspaceId, selectedAlbumId);
  const selectedMediaAlbumsQuery = useMediaAlbums(dockspaceId, selectedMediaId);

  const createAlbumMutation = useCreateAlbum(dockspaceId);
  const renameAlbumMutation = useRenameAlbum(dockspaceId);
  const deleteAlbumMutation = useDeleteAlbum(dockspaceId);
  const assignAlbumMediaMutation = useAssignAlbumMedia(dockspaceId);
  const removeAlbumMediaMutation = useRemoveAlbumMedia(dockspaceId);
  const uploadFileMutation = useUploadFile(dockspaceId, '/');
  const moveToTrashMutation = useMoveToTrash(dockspaceId, '/');

  const uploadDialog = useDockspaceUploadDialog({
    currentFolderPath: '/',
    uploadFile: uploadFileMutation.mutateAsync
  });

  const albums = albumsQuery.data ?? [];
  const allMedia = mediaQuery.data ?? [];
  const mediaItems =
    albumFilterId && activeTab === 'all' ? (filteredAlbumMediaQuery.data ?? []) : allMedia;
  const selectedMedia =
    (selectedMediaId ? allMedia.find((item) => item.fileNodeId === selectedMediaId) : null) ?? null;
  const selectedMediaAlbumIds = useMemo(
    () => new Set((selectedMediaAlbumsQuery.data ?? []).map((album) => album.albumId)),
    [selectedMediaAlbumsQuery.data]
  );
  const albumViewItems = selectedAlbumMediaQuery.data ?? [];

  const unauthorized =
    (mediaQuery.error instanceof ApiError && mediaQuery.error.statusCode === 403) ||
    (albumsQuery.error instanceof ApiError && albumsQuery.error.statusCode === 403);
  const uploadErrorMessage =
    localError ??
    uploadDialog.validationError ??
    (uploadFileMutation.error instanceof ApiError &&
    uploadFileMutation.error.code === 'UPLOAD_SKIPPED_DUPLICATE'
      ? null
      : uploadFileMutation.error instanceof Error
        ? uploadFileMutation.error.message
        : null);
  const membershipMutationPending =
    assignAlbumMediaMutation.isPending || removeAlbumMediaMutation.isPending;
  const mediaListError =
    mediaQuery.error instanceof Error
      ? mediaQuery.error.message
      : filteredAlbumMediaQuery.error instanceof Error
        ? filteredAlbumMediaQuery.error.message
        : null;

  useEffect(() => {
    if (!selectedMediaId) {
      return;
    }

    if (!allMedia.some((item) => item.fileNodeId === selectedMediaId)) {
      setSelectedMediaId(null);
    }
  }, [allMedia, selectedMediaId]);

  useEffect(() => {
    if (albumFilterId && !albums.some((album) => album.albumId === albumFilterId)) {
      setAlbumFilterId('');
    }
  }, [albumFilterId, albums]);

  useEffect(() => {
    if (selectedAlbumId && !albums.some((album) => album.albumId === selectedAlbumId)) {
      setSelectedAlbumId(null);
    }
  }, [albums, selectedAlbumId]);

  const onUploadButtonClick = useCallback(() => {
    uploadDialog.clearValidationError();
    setLocalError(null);
    fileInputRef.current?.click();
  }, [uploadDialog]);

  const onMediaFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      if (!selectedFiles.length) {
        return;
      }

      const mediaFiles = selectedFiles.filter(isMediaFile);
      const rejectedCount = selectedFiles.length - mediaFiles.length;

      if (rejectedCount > 0) {
        const suffix = rejectedCount === 1 ? '' : 's';
        setLocalError(
          `${rejectedCount} file${suffix} were skipped because PHOTOS_VIDEOS accepts only image/video uploads.`
        );
      } else {
        setLocalError(null);
      }

      if (mediaFiles.length > 0) {
        uploadDialog.stageFiles(mediaFiles);
      }

      event.target.value = '';
    },
    [uploadDialog]
  );

  const onCreateAlbum = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedName = newAlbumName.trim();

      if (!trimmedName || createAlbumMutation.isPending) {
        return;
      }

      try {
        setLocalError(null);
        const createdAlbum = await createAlbumMutation.mutateAsync(trimmedName);
        setNewAlbumName('');
        setSelectedAlbumId(createdAlbum.albumId);
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : 'Failed to create album.');
      }
    },
    [createAlbumMutation, newAlbumName]
  );

  const onRenameAlbum = useCallback(
    async (albumId: string, currentName: string) => {
      const nextName = window.prompt('Rename album', currentName);
      if (!nextName) {
        return;
      }

      const trimmedName = nextName.trim();
      if (!trimmedName) {
        return;
      }

      try {
        setLocalError(null);
        await renameAlbumMutation.mutateAsync({
          albumId,
          name: trimmedName
        });
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : 'Failed to rename album.');
      }
    },
    [renameAlbumMutation]
  );

  const onDeleteAlbum = useCallback(
    async (albumId: string, albumName: string) => {
      const confirmed = window.confirm(`Delete album "${albumName}"?`);
      if (!confirmed) {
        return;
      }

      try {
        setLocalError(null);
        await deleteAlbumMutation.mutateAsync(albumId);
        if (selectedAlbumId === albumId) {
          setSelectedAlbumId(null);
        }

        if (albumFilterId === albumId) {
          setAlbumFilterId('');
        }
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : 'Failed to delete album.');
      }
    },
    [albumFilterId, deleteAlbumMutation, selectedAlbumId]
  );

  const onToggleMembership = useCallback(
    async (albumId: string, assigned: boolean) => {
      if (!selectedMedia) {
        return;
      }

      try {
        setLocalError(null);
        if (assigned) {
          await removeAlbumMediaMutation.mutateAsync({
            albumId,
            fileNodeId: selectedMedia.fileNodeId
          });
          return;
        }

        await assignAlbumMediaMutation.mutateAsync({
          albumId,
          fileNodeIds: [selectedMedia.fileNodeId]
        });
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : 'Failed to update album membership.');
      }
    },
    [assignAlbumMediaMutation, removeAlbumMediaMutation, selectedMedia]
  );

  const onMoveSelectedMediaToTrash = useCallback(async () => {
    if (!selectedMedia) {
      return;
    }

    try {
      setLocalError(null);
      await moveToTrashMutation.mutateAsync({
        fullPath: selectedMedia.fullPath,
        targetType: 'file'
      });
      setSelectedMediaId(null);
      setViewerFile(null);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to move media to trash.');
    }
  }, [moveToTrashMutation, selectedMedia]);

  const openPreview = useCallback((item: MediaFileRecord) => {
    setViewerFile({
      fileNodeId: item.fileNodeId,
      fullPath: item.fullPath,
      size: item.size,
      contentType: item.contentType,
      updatedAt: item.updatedAt,
      state: item.state
    });
  }, []);

  return (
    <RequireAuth>
      <Page className="page--media" title={dockspaceName}>
        {unauthorized ? (
          <UnauthorizedNotice />
        ) : (
          <Card title="Media Workspace">
            <div className="media-workspace">
              <div className="media-workspace__header">
                <div className="media-workspace__tabs" role="tablist" aria-label="Media workspace views">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'all'}
                    className="media-workspace__tab"
                    data-active={activeTab === 'all'}
                    onClick={() => setActiveTab('all')}
                  >
                    All Media
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'albums'}
                    className="media-workspace__tab"
                    data-active={activeTab === 'albums'}
                    onClick={() => setActiveTab('albums')}
                  >
                    Albums
                  </button>
                </div>
                <div className="media-workspace__actions">
                  <Button type="button" onClick={onUploadButtonClick}>
                    Upload media
                  </Button>
                  <Link to="/dockspaces/$dockspaceId/trash" params={{ dockspaceId }}>
                    Trash
                  </Link>
                  <Link to="/dockspaces/$dockspaceId/purged" params={{ dockspaceId }}>
                    Purged
                  </Link>
                </div>
              </div>

              <input
                ref={fileInputRef}
                className="dockspace-files__hidden-input"
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={onMediaFileInputChange}
              />

              {uploadErrorMessage ? <Alert message={uploadErrorMessage} /> : null}
              {mediaListError ? <Alert message={mediaListError} /> : null}
              {localError && localError !== uploadErrorMessage ? <Alert message={localError} /> : null}

              {activeTab === 'all' ? (
                <div className="media-workspace__layout">
                  <section className="media-workspace__main">
                    <div className="media-workspace__filter-row">
                      <label htmlFor="album-filter">Filter by album</label>
                      <select
                        id="album-filter"
                        value={albumFilterId}
                        onChange={(event) => setAlbumFilterId(event.target.value)}
                      >
                        <option value="">All media</option>
                        {albums.map((album) => (
                          <option key={album.albumId} value={album.albumId}>
                            {album.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {mediaQuery.isLoading || (albumFilterId ? filteredAlbumMediaQuery.isLoading : false) ? (
                      <p>Loading media...</p>
                    ) : mediaItems.length === 0 ? (
                      <p>No media files available.</p>
                    ) : (
                      <ul className="media-grid">
                        {mediaItems.map((item) => {
                          const selected = selectedMediaId === item.fileNodeId;
                          const fileName = basename(item.fullPath);
                          const isImage = item.contentType.startsWith('image/');

                          return (
                            <li key={item.fileNodeId} className="media-grid__item">
                              <button
                                type="button"
                                className="media-card"
                                data-selected={selected}
                                onClick={() => setSelectedMediaId(item.fileNodeId)}
                              >
                                <span className="media-card__thumbnail" aria-hidden="true">
                                  {isImage ? <ImageIcon size={18} /> : <Film size={18} />}
                                </span>
                                <span className="media-card__name">{fileName}</span>
                                <span className="media-card__meta">{formatBytes(item.size)}</span>
                                <span className="media-card__meta">{formatTimestamp(item.updatedAt)}</span>
                              </button>
                              <div className="media-card__actions">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => openPreview(item)}
                                >
                                  Preview
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>

                  <aside className="media-workspace__side">
                    <h3>Selected Media</h3>
                    {selectedMedia ? (
                      <div className="media-detail">
                        <p className="media-detail__name">{basename(selectedMedia.fullPath)}</p>
                        <p className="media-detail__meta">{formatBytes(selectedMedia.size)}</p>
                        <p className="media-detail__meta">{selectedMedia.contentType}</p>

                        <div className="media-detail__chips">
                          {(selectedMediaAlbumsQuery.data ?? []).length ? (
                            (selectedMediaAlbumsQuery.data ?? []).map((album) => (
                              <span key={album.albumId} className="media-detail__chip">
                                {album.name}
                              </span>
                            ))
                          ) : (
                            <span className="media-detail__chip media-detail__chip--empty">
                              No albums assigned
                            </span>
                          )}
                        </div>

                        <div className="media-detail__album-picker">
                          <h4>Assign Albums</h4>
                          {!albums.length ? (
                            <p>Create an album first to organize this media.</p>
                          ) : (
                            <ul className="media-detail__album-list">
                              {albums.map((album) => {
                                const assigned = selectedMediaAlbumIds.has(album.albumId);

                                return (
                                  <li key={album.albumId}>
                                    <label>
                                      <input
                                        type="checkbox"
                                        checked={assigned}
                                        disabled={membershipMutationPending}
                                        onChange={() => onToggleMembership(album.albumId, assigned)}
                                      />
                                      <span>{album.name}</span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>

                        <Button
                          type="button"
                          variant="secondary"
                          onClick={onMoveSelectedMediaToTrash}
                          disabled={moveToTrashMutation.isPending}
                        >
                          {moveToTrashMutation.isPending ? 'Moving...' : 'Move to trash'}
                        </Button>
                      </div>
                    ) : (
                      <p>Select a media item to preview details and assign albums.</p>
                    )}

                    <div className="media-workspace__uploads">
                      <h4>Upload Queue</h4>
                      <UploadStagingList
                        stagedFiles={uploadDialog.activeUploads}
                        emptyStateMessage="No active uploads."
                      />
                      {uploadDialog.skippedUploads.length ? (
                        <div className="dockspace-sidebar__uploads-skipped-card">
                          <p className="dockspace-sidebar__uploads-skipped-title">
                            {uploadDialog.skippedUploads.length} file
                            {uploadDialog.skippedUploads.length === 1 ? '' : 's'} skipped as duplicates.
                          </p>
                          <ul className="dockspace-sidebar__uploads-skipped-list">
                            {uploadDialog.skippedUploads.map((item) => (
                              <li
                                key={`${item.duplicateType}:${item.fullPath}`}
                                className="dockspace-sidebar__uploads-skipped-item"
                              >
                                <span className="dockspace-sidebar__uploads-skipped-path">{item.fullPath}</span>
                              </li>
                            ))}
                          </ul>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={uploadDialog.clearSkippedUploads}
                          >
                            Dismiss
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </aside>
                </div>
              ) : (
                <div className="media-albums">
                  <form className="media-albums__create-form" onSubmit={onCreateAlbum}>
                    <label htmlFor="new-album-name">New album</label>
                    <input
                      id="new-album-name"
                      type="text"
                      value={newAlbumName}
                      placeholder="Summer 2026"
                      onChange={(event) => setNewAlbumName(event.target.value)}
                    />
                    <Button type="submit" disabled={createAlbumMutation.isPending}>
                      {createAlbumMutation.isPending ? 'Creating...' : 'Create album'}
                    </Button>
                  </form>

                  <div className="media-albums__layout">
                    <section className="media-albums__list">
                      <h3>Albums</h3>
                      {albumsQuery.isLoading ? (
                        <p>Loading albums...</p>
                      ) : !albums.length ? (
                        <p>No albums yet.</p>
                      ) : (
                        <ul>
                          {albums.map((album) => (
                            <li key={album.albumId} className="media-albums__item">
                              <button
                                type="button"
                                className="media-albums__open-button"
                                data-active={selectedAlbumId === album.albumId}
                                onClick={() => setSelectedAlbumId(album.albumId)}
                              >
                                <span>{album.name}</span>
                                <small>{album.mediaCount ?? 0} items</small>
                              </button>
                              <div className="media-albums__item-actions">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => onRenameAlbum(album.albumId, album.name)}
                                  disabled={renameAlbumMutation.isPending}
                                >
                                  Rename
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={() => onDeleteAlbum(album.albumId, album.name)}
                                  disabled={deleteAlbumMutation.isPending}
                                >
                                  Delete
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className="media-albums__content">
                      <h3>{selectedAlbumId ? 'Album Media' : 'Select an Album'}</h3>
                      {!selectedAlbumId ? (
                        <p>Choose an album to browse its media files.</p>
                      ) : selectedAlbumMediaQuery.isLoading ? (
                        <p>Loading album media...</p>
                      ) : albumViewItems.length === 0 ? (
                        <p>This album has no media yet.</p>
                      ) : (
                        <ul className="media-grid">
                          {albumViewItems.map((item) => {
                            const isImage = item.contentType.startsWith('image/');

                            return (
                              <li key={item.fileNodeId} className="media-grid__item">
                                <button
                                  type="button"
                                  className="media-card"
                                  onClick={() => openPreview(item)}
                                >
                                  <span className="media-card__thumbnail" aria-hidden="true">
                                    {isImage ? <ImageIcon size={18} /> : <Film size={18} />}
                                  </span>
                                  <span className="media-card__name">{basename(item.fullPath)}</span>
                                  <span className="media-card__meta">{formatBytes(item.size)}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
      </Page>
      <FileViewerDialog
        dockspaceId={dockspaceId}
        file={viewerFile}
        isOpen={Boolean(viewerFile)}
        onClose={() => setViewerFile(null)}
      />
    </RequireAuth>
  );
};
