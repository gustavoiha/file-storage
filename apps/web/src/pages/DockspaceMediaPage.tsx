import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent
} from 'react';
import { Link } from '@tanstack/react-router';
import {
  Film,
  Grid2x2,
  Grid3x3,
  Image as ImageIcon,
  LayoutGrid,
  type LucideIcon
} from 'lucide-react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { FilePreviewContent } from '@/components/files/FilePreviewContent';
import { FileViewerDialog } from '@/components/files/FileViewerDialog';
import { UploadStagingList } from '@/components/files/UploadStagingList';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Page } from '@/components/ui/Page';
import { useMoveToTrash, useTrashFilesBatch, useUploadFile } from '@/hooks/useFiles';
import { useDockspaceUploadDialog } from '@/hooks/useDockspaceUploadDialog';
import {
  useAlbumMedia,
  useAlbums,
  useAssignAlbumMedia,
  useMediaAlbums,
  useMediaDuplicates,
  useMediaFiles,
  useRemoveAlbumMedia,
} from '@/hooks/useMedia';
import { ApiError } from '@/lib/apiClient';
import type { FileRecord, MediaFileRecord } from '@/lib/apiTypes';
import { isLikelyMediaFile } from '@/lib/fileContentType';

interface DockspaceMediaPageProps {
  dockspaceId: string;
  dockspaceName: string;
}

type MediaGridSize = 'small' | 'medium' | 'large';

interface DuplicateGroupSelection {
  keeperFileNodeId: string;
  selectedForTrashFileNodeIds: string[];
}

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

interface VirtualizedMediaGridProps {
  items: MediaFileRecord[];
  gridSize: MediaGridSize;
  selectedMediaId: string | null;
  onSelectMedia: (fileNodeId: string) => void;
  onOpenPreview: (item: MediaFileRecord) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

const MEDIA_GRID_GAP_PX = 12;
const MEDIA_GRID_OVERSCAN_ROWS = 2;
const MEDIA_GRID_LAYOUT: Record<MediaGridSize, { minColumnWidthPx: number; rowHeightPx: number }> = {
  small: {
    minColumnWidthPx: 132,
    rowHeightPx: 140
  },
  medium: {
    minColumnWidthPx: 190,
    rowHeightPx: 198
  },
  large: {
    minColumnWidthPx: 248,
    rowHeightPx: 256
  }
};
const MEDIA_GRID_SIZE_OPTIONS: Array<{
  size: MediaGridSize;
  label: string;
  Icon: LucideIcon;
}> = [
  { size: 'small', label: 'Show small thumbnails', Icon: Grid3x3 },
  { size: 'medium', label: 'Show medium thumbnails', Icon: Grid2x2 },
  { size: 'large', label: 'Show large thumbnails', Icon: LayoutGrid }
];

const VirtualizedMediaGrid = ({
  items,
  gridSize,
  selectedMediaId,
  onSelectMedia,
  onOpenPreview,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore
}: VirtualizedMediaGridProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const gridLayout = MEDIA_GRID_LAYOUT[gridSize];
  const rowHeightPx = gridLayout.rowHeightPx;
  const minColumnWidthPx = gridLayout.minColumnWidthPx;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateViewport = () => {
      setViewportWidth(element.clientWidth);
      setViewportHeight(element.clientHeight);
    };

    updateViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewport);
      return () => {
        window.removeEventListener('resize', updateViewport);
      };
    }

    const observer = new ResizeObserver(() => {
      updateViewport();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const columnCount = Math.max(
    1,
    Math.floor((viewportWidth + MEDIA_GRID_GAP_PX) / (minColumnWidthPx + MEDIA_GRID_GAP_PX))
  );
  const rowCount = Math.ceil(items.length / columnCount);
  const totalHeight = rowCount * rowHeightPx;
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeightPx) - MEDIA_GRID_OVERSCAN_ROWS);
  const endRow =
    rowCount > 0
      ? Math.min(
          rowCount - 1,
          Math.ceil((scrollTop + viewportHeight) / rowHeightPx) + MEDIA_GRID_OVERSCAN_ROWS
        )
      : -1;
  const visibleStartIndex = startRow * columnCount;
  const visibleEndIndex = endRow >= 0 ? Math.min(items.length, (endRow + 1) * columnCount) : 0;
  const visibleItems = items.slice(visibleStartIndex, visibleEndIndex);
  const topSpacerHeight = startRow * rowHeightPx;
  const visibleRowCount = endRow >= startRow ? endRow - startRow + 1 : 0;
  const bottomSpacerHeight = Math.max(0, totalHeight - topSpacerHeight - visibleRowCount * rowHeightPx);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    const remainingHeight = totalHeight - (scrollTop + viewportHeight);
    if (remainingHeight <= rowHeightPx * 2) {
      onLoadMore();
    }
  }, [hasNextPage, isFetchingNextPage, onLoadMore, rowHeightPx, scrollTop, totalHeight, viewportHeight]);

  return (
    <div
      ref={containerRef}
      className="media-grid-virtual"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      {topSpacerHeight > 0 ? (
        <div className="media-grid-virtual__spacer" style={{ height: `${topSpacerHeight}px` }} />
      ) : null}

      <ul
        className={`media-grid media-grid--virtual media-grid--${gridSize}`}
        style={{
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`
        }}
      >
        {visibleItems.map((item) => {
          const selected = selectedMediaId === item.fileNodeId;
          const isImage = item.contentType.startsWith('image/');

          return (
            <li
              key={item.fileNodeId}
              className="media-grid__item media-grid__item--virtual"
              style={{ height: `${rowHeightPx}px` }}
            >
              <button
                type="button"
                className="media-card"
                data-selected={selected}
                aria-label={`Select ${basename(item.fullPath)}`}
                onClick={() => {
                  onSelectMedia(item.fileNodeId);
                }}
                onDoubleClick={() => {
                  onSelectMedia(item.fileNodeId);
                  onOpenPreview(item);
                }}
              >
                <span className="media-card__thumbnail" aria-hidden="true">
                  {item.thumbnail?.url ? (
                    <img
                      className="media-card__thumbnail-image"
                      src={item.thumbnail.url}
                      alt=""
                      loading="lazy"
                    />
                  ) : isImage ? (
                    <ImageIcon size={18} />
                  ) : (
                    <Film size={18} />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {bottomSpacerHeight > 0 ? (
        <div className="media-grid-virtual__spacer" style={{ height: `${bottomSpacerHeight}px` }} />
      ) : null}

      {isFetchingNextPage ? <p className="media-grid-virtual__status">Loading more media...</p> : null}
    </div>
  );
};

export const DockspaceMediaPage = ({ dockspaceId, dockspaceName }: DockspaceMediaPageProps) => {
  const [mediaGridSize, setMediaGridSize] = useState<MediaGridSize>('medium');
  const [duplicatesVisible, setDuplicatesVisible] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [duplicateActionMessage, setDuplicateActionMessage] = useState<string | null>(null);
  const [duplicateSelections, setDuplicateSelections] = useState<
    Record<string, DuplicateGroupSelection>
  >({});
  const [viewerFile, setViewerFile] = useState<FileRecord | null>(null);
  const [viewerThumbnailUrl, setViewerThumbnailUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mediaQuery = useMediaFiles(dockspaceId);
  const mediaDuplicatesQuery = useMediaDuplicates(
    dockspaceId,
    20,
    !selectedAlbumId && duplicatesVisible
  );
  const albumsQuery = useAlbums(dockspaceId);
  const selectedAlbumMediaQuery = useAlbumMedia(dockspaceId, selectedAlbumId);
  const selectedMediaAlbumsQuery = useMediaAlbums(dockspaceId, selectedMediaId);

  const assignAlbumMediaMutation = useAssignAlbumMedia(dockspaceId);
  const removeAlbumMediaMutation = useRemoveAlbumMedia(dockspaceId);
  const uploadFileMutation = useUploadFile(dockspaceId, '/');
  const moveToTrashMutation = useMoveToTrash(dockspaceId, '/');
  const trashFilesBatchMutation = useTrashFilesBatch(dockspaceId);

  const uploadDialog = useDockspaceUploadDialog({
    currentFolderPath: '/',
    uploadFile: uploadFileMutation.mutateAsync
  });

  const albums = albumsQuery.data ?? [];
  const allMedia = useMemo(
    () => mediaQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [mediaQuery.data]
  );
  const mediaItems = selectedAlbumId ? (selectedAlbumMediaQuery.data ?? []) : allMedia;
  const selectedMedia =
    (selectedMediaId
      ? mediaItems.find((item) => item.fileNodeId === selectedMediaId) ??
        allMedia.find((item) => item.fileNodeId === selectedMediaId)
      : null) ?? null;
  const selectedMediaPreviewFile = useMemo<FileRecord | null>(
    () =>
      selectedMedia
        ? {
            fileNodeId: selectedMedia.fileNodeId,
            fullPath: selectedMedia.fullPath,
            size: selectedMedia.size,
            contentType: selectedMedia.contentType,
            updatedAt: selectedMedia.updatedAt,
            state: selectedMedia.state
          }
        : null,
    [selectedMedia]
  );
  const selectedMediaAlbumIds = useMemo(
    () => new Set((selectedMediaAlbumsQuery.data ?? []).map((album) => album.albumId)),
    [selectedMediaAlbumsQuery.data]
  );
  const duplicateGroups = useMemo(
    () => mediaDuplicatesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [mediaDuplicatesQuery.data]
  );
  const duplicateSummary = useMemo(
    () =>
      mediaDuplicatesQuery.data?.pages[0]?.summary ?? {
        groupCount: 0,
        duplicateItemCount: 0,
        reclaimableBytes: 0
      },
    [mediaDuplicatesQuery.data]
  );
  const selectedDuplicatePaths = useMemo(() => {
    const pathByGroupAndFileNode = new Map<string, string>();
    for (const group of duplicateGroups) {
      for (const item of group.items) {
        pathByGroupAndFileNode.set(`${group.contentHash}#${item.fileNodeId}`, item.fullPath);
      }
    }

    const paths: string[] = [];
    for (const group of duplicateGroups) {
      const selection = duplicateSelections[group.contentHash];
      if (!selection) {
        continue;
      }

      for (const fileNodeId of selection.selectedForTrashFileNodeIds) {
        const fullPath = pathByGroupAndFileNode.get(`${group.contentHash}#${fileNodeId}`);
        if (fullPath) {
          paths.push(fullPath);
        }
      }
    }

    return Array.from(new Set(paths));
  }, [duplicateGroups, duplicateSelections]);

  const unauthorized =
    (mediaQuery.error instanceof ApiError && mediaQuery.error.statusCode === 403) ||
    (albumsQuery.error instanceof ApiError && albumsQuery.error.statusCode === 403) ||
    (mediaDuplicatesQuery.error instanceof ApiError && mediaDuplicatesQuery.error.statusCode === 403);
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
    selectedAlbumId && selectedAlbumMediaQuery.error instanceof Error
      ? selectedAlbumMediaQuery.error.message
      : mediaQuery.error instanceof Error
      ? mediaQuery.error.message
      : null;
  const duplicatesListError =
    mediaDuplicatesQuery.error instanceof Error ? mediaDuplicatesQuery.error.message : null;
  const mediaHasNextPage = !selectedAlbumId && Boolean(mediaQuery.hasNextPage);
  const mediaIsFetchingNextPage = !selectedAlbumId && mediaQuery.isFetchingNextPage;
  const mediaListIsLoading =
    mediaQuery.isLoading || (Boolean(selectedAlbumId) && selectedAlbumMediaQuery.isLoading);

  const onLoadMoreMedia = useCallback(() => {
    if (!mediaHasNextPage || mediaIsFetchingNextPage) {
      return;
    }

    void mediaQuery.fetchNextPage();
  }, [mediaHasNextPage, mediaIsFetchingNextPage, mediaQuery.fetchNextPage]);

  useEffect(() => {
    if (!selectedMediaId) {
      return;
    }

    const selectedExists =
      mediaItems.some((item) => item.fileNodeId === selectedMediaId) ||
      allMedia.some((item) => item.fileNodeId === selectedMediaId);
    if (!selectedExists) {
      setSelectedMediaId(null);
    }
  }, [allMedia, mediaItems, selectedMediaId]);

  useEffect(() => {
    if (selectedAlbumId && !albums.some((album) => album.albumId === selectedAlbumId)) {
      setSelectedAlbumId(null);
    }
  }, [albums, selectedAlbumId]);

  useEffect(() => {
    if (!duplicateGroups.length) {
      setDuplicateSelections({});
      return;
    }

    setDuplicateSelections((previous) => {
      const next: Record<string, DuplicateGroupSelection> = {};

      for (const group of duplicateGroups) {
        const fileNodeIds = group.items.map((item) => item.fileNodeId);
        const previousSelection = previous[group.contentHash];
        const keeperFileNodeId = fileNodeIds.includes(previousSelection?.keeperFileNodeId ?? '')
          ? (previousSelection?.keeperFileNodeId ?? group.defaultKeeperFileNodeId)
          : group.defaultKeeperFileNodeId;
        const defaultSelections = group.items
          .map((item) => item.fileNodeId)
          .filter((fileNodeId) => fileNodeId !== keeperFileNodeId);
        const selectedForTrashFileNodeIds = Array.from(
          new Set(
            (previousSelection?.selectedForTrashFileNodeIds ?? defaultSelections).filter(
              (fileNodeId) => fileNodeIds.includes(fileNodeId) && fileNodeId !== keeperFileNodeId
            )
          )
        );

        next[group.contentHash] = {
          keeperFileNodeId,
          selectedForTrashFileNodeIds
        };
      }

      return next;
    });
  }, [duplicateGroups]);

  const onUploadButtonClick = useCallback(() => {
    uploadDialog.clearValidationError();
    setLocalError(null);
    fileInputRef.current?.click();
  }, [uploadDialog]);

  const onToggleDuplicates = useCallback(() => {
    setDuplicateActionMessage(null);
    setDuplicatesVisible((previous) => !previous);
  }, []);

  const onSelectAllMedia = useCallback(() => {
    setSelectedAlbumId(null);
    setDuplicateActionMessage(null);
  }, []);

  const onSelectAlbum = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value.trim();
    setSelectedAlbumId(value || null);
    setDuplicateActionMessage(null);
    setDuplicatesVisible(false);
  }, []);

  const onMediaFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      if (!selectedFiles.length) {
        return;
      }

      const mediaFiles = selectedFiles.filter(isLikelyMediaFile);
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
      setViewerThumbnailUrl(null);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to move media to trash.');
    }
  }, [moveToTrashMutation, selectedMedia]);

  const onSelectDuplicateKeeper = useCallback((contentHash: string, fileNodeId: string) => {
    setDuplicateSelections((previous) => {
      const current = previous[contentHash];
      if (!current) {
        return previous;
      }

      const nextSelectedForTrash = Array.from(
        new Set(current.selectedForTrashFileNodeIds.filter((candidate) => candidate !== fileNodeId))
      );
      if (current.keeperFileNodeId && current.keeperFileNodeId !== fileNodeId) {
        nextSelectedForTrash.push(current.keeperFileNodeId);
      }

      return {
        ...previous,
        [contentHash]: {
          keeperFileNodeId: fileNodeId,
          selectedForTrashFileNodeIds: Array.from(new Set(nextSelectedForTrash))
        }
      };
    });
  }, []);

  const onToggleDuplicateSelection = useCallback((contentHash: string, fileNodeId: string) => {
    setDuplicateSelections((previous) => {
      const current = previous[contentHash];
      if (!current || current.keeperFileNodeId === fileNodeId) {
        return previous;
      }

      const selectedSet = new Set(current.selectedForTrashFileNodeIds);
      if (selectedSet.has(fileNodeId)) {
        selectedSet.delete(fileNodeId);
      } else {
        selectedSet.add(fileNodeId);
      }

      return {
        ...previous,
        [contentHash]: {
          ...current,
          selectedForTrashFileNodeIds: Array.from(selectedSet)
        }
      };
    });
  }, []);

  const onTrashSelectedDuplicates = useCallback(async () => {
    if (!selectedDuplicatePaths.length || trashFilesBatchMutation.isPending) {
      return;
    }

    try {
      setDuplicateActionMessage(null);
      const result = await trashFilesBatchMutation.mutateAsync(selectedDuplicatePaths);
      const failedCount = result.failed.length;
      if (failedCount > 0) {
        setDuplicateActionMessage(
          `Moved ${result.movedPaths.length} items to trash. ${failedCount} failed.`
        );
      } else {
        setDuplicateActionMessage(`Moved ${result.movedPaths.length} items to trash.`);
      }
    } catch (error) {
      setDuplicateActionMessage(
        error instanceof Error ? error.message : 'Failed to move selected duplicates to trash.'
      );
    }
  }, [selectedDuplicatePaths, trashFilesBatchMutation]);

  const openPreview = useCallback((item: MediaFileRecord) => {
    setViewerFile({
      fileNodeId: item.fileNodeId,
      fullPath: item.fullPath,
      size: item.size,
      contentType: item.contentType,
      updatedAt: item.updatedAt,
      state: item.state
    });
    setViewerThumbnailUrl(item.thumbnail?.url ?? null);
  }, []);

  return (
    <RequireAuth>
      <Page className="page--media" title={dockspaceName}>
        {unauthorized ? (
          <UnauthorizedNotice />
        ) : (
          <div className="media-workspace">
            <div className="media-workspace__header">
              <div className="media-workspace__actions">
                <Button type="button" onClick={onUploadButtonClick}>
                  Upload media
                </Button>
                {!selectedAlbumId ? (
                  <Button type="button" variant="secondary" onClick={onToggleDuplicates}>
                    {duplicatesVisible ? 'Browse media' : 'Find duplicates'}
                  </Button>
                ) : null}
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
            {duplicatesVisible && duplicatesListError ? <Alert message={duplicatesListError} /> : null}
            {localError && localError !== uploadErrorMessage ? <Alert message={localError} /> : null}

            <div className="media-workspace__layout">
              <section className="media-workspace__main">
                <div className="media-workspace__main-controls">
                  <div className="media-workspace__tabs" role="group" aria-label="Media source">
                    <button
                      type="button"
                      className="media-workspace__tab"
                      data-active={!selectedAlbumId}
                      onClick={onSelectAllMedia}
                    >
                      All Media
                    </button>
                    <select
                      className="media-workspace__album-select"
                      aria-label="Select album"
                      value={selectedAlbumId ?? ''}
                      onChange={onSelectAlbum}
                    >
                      <option value="">Album</option>
                      {albums.map((album) => (
                        <option key={album.albumId} value={album.albumId}>
                          {album.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="media-grid-size-toggle" role="group" aria-label="Gallery thumbnail size">
                    {MEDIA_GRID_SIZE_OPTIONS.map(({ size, label, Icon }) => (
                      <button
                        key={size}
                        type="button"
                        className="media-grid-size-toggle__button"
                        aria-label={label}
                        aria-pressed={mediaGridSize === size}
                        data-active={mediaGridSize === size}
                        onClick={() => setMediaGridSize(size)}
                      >
                        <Icon size={16} />
                      </button>
                    ))}
                  </div>
                </div>

                {!selectedAlbumId && duplicatesVisible ? (
                  <div className="media-duplicates">
                    <div className="media-duplicates__summary">
                      <p>{duplicateSummary.groupCount} duplicate groups found.</p>
                      <p>{duplicateSummary.duplicateItemCount} repeated files.</p>
                      <p>{formatBytes(duplicateSummary.reclaimableBytes)} reclaimable.</p>
                    </div>
                    {duplicateActionMessage ? <Alert message={duplicateActionMessage} /> : null}
                    {mediaDuplicatesQuery.isLoading ? (
                      <p>Loading duplicates...</p>
                    ) : duplicateGroups.length === 0 ? (
                      <p>No duplicate media files found.</p>
                    ) : (
                      <ul className="media-duplicates__groups">
                        {duplicateGroups.map((group) => {
                          const selection = duplicateSelections[group.contentHash];
                          const keeperFileNodeId =
                            selection?.keeperFileNodeId ?? group.defaultKeeperFileNodeId;
                          const selectedForTrash = new Set(
                            selection?.selectedForTrashFileNodeIds ?? []
                          );

                          return (
                            <li key={group.contentHash} className="media-duplicates__group">
                              <p className="media-duplicates__group-title">
                                Hash {group.contentHash.slice(0, 12)}...
                              </p>
                              <p className="media-duplicates__group-meta">
                                {group.items.length} files, {formatBytes(group.reclaimableBytes)} reclaimable
                              </p>
                              <ul className="media-duplicates__items">
                                {group.items.map((item) => (
                                  <li key={item.fileNodeId} className="media-duplicates__item">
                                    <div className="media-duplicates__item-main">
                                      <span>{basename(item.fullPath)}</span>
                                      <small>{formatTimestamp(item.updatedAt)}</small>
                                    </div>
                                    <label className="media-duplicates__item-control">
                                      <input
                                        type="radio"
                                        name={`keeper-${group.contentHash}`}
                                        checked={keeperFileNodeId === item.fileNodeId}
                                        onChange={() =>
                                          onSelectDuplicateKeeper(group.contentHash, item.fileNodeId)
                                        }
                                      />
                                      <span>Keep</span>
                                    </label>
                                    <label className="media-duplicates__item-control">
                                      <input
                                        type="checkbox"
                                        checked={selectedForTrash.has(item.fileNodeId)}
                                        disabled={keeperFileNodeId === item.fileNodeId}
                                        onChange={() =>
                                          onToggleDuplicateSelection(group.contentHash, item.fileNodeId)
                                        }
                                      />
                                      <span>Trash</span>
                                    </label>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {mediaDuplicatesQuery.hasNextPage ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void mediaDuplicatesQuery.fetchNextPage()}
                        disabled={mediaDuplicatesQuery.isFetchingNextPage}
                      >
                        {mediaDuplicatesQuery.isFetchingNextPage ? 'Loading...' : 'Load more'}
                      </Button>
                    ) : null}
                    <div className="media-duplicates__footer">
                      <p>{selectedDuplicatePaths.length} items selected for trash.</p>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={onTrashSelectedDuplicates}
                        disabled={trashFilesBatchMutation.isPending || selectedDuplicatePaths.length === 0}
                      >
                        {trashFilesBatchMutation.isPending ? 'Moving...' : 'Move selected to trash'}
                      </Button>
                    </div>
                  </div>
                ) : mediaListIsLoading ? (
                  <p>Loading media...</p>
                ) : mediaItems.length === 0 ? (
                  <p>{selectedAlbumId ? 'This album has no media yet.' : 'No media files available.'}</p>
                ) : (
                  <VirtualizedMediaGrid
                    key={selectedAlbumId ?? 'all-media'}
                    items={mediaItems}
                    gridSize={mediaGridSize}
                    selectedMediaId={selectedMediaId}
                    onSelectMedia={setSelectedMediaId}
                    onOpenPreview={openPreview}
                    hasNextPage={mediaHasNextPage}
                    isFetchingNextPage={mediaIsFetchingNextPage}
                    onLoadMore={onLoadMoreMedia}
                  />
                )}
              </section>

              <aside className="media-workspace__side">
                <h3>Selected Media</h3>
                {selectedMedia ? (
                  <div className="media-detail">
                    <div className="media-detail__preview">
                      <FilePreviewContent
                        dockspaceId={dockspaceId}
                        file={selectedMediaPreviewFile}
                        thumbnailUrl={selectedMedia.thumbnail?.url ?? null}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => openPreview(selectedMedia)}
                    >
                      Open fullscreen
                    </Button>
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
                    onRetryUpload={uploadDialog.retryUpload}
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
          </div>
        )}
      </Page>
      <FileViewerDialog
        dockspaceId={dockspaceId}
        file={viewerFile}
        isOpen={Boolean(viewerFile)}
        thumbnailUrl={viewerThumbnailUrl}
        onClose={() => {
          setViewerFile(null);
          setViewerThumbnailUrl(null);
        }}
      />
    </RequireAuth>
  );
};
