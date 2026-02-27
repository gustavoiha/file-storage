import { useMemo } from 'react';
import { ApiError } from '@/lib/apiClient';
import type { FileRecord } from '@/lib/apiTypes';
import {
  useAlbumMedia,
  useAlbums,
  useMediaAlbums,
  useMediaDuplicates,
  useMediaFiles
} from '@/hooks/useMedia';

interface UseMediaPageQueriesParams {
  dockspaceId: string;
  selectedAlbumId: string | null;
  selectedMediaId: string | null;
  duplicatesVisible: boolean;
}

export const useMediaPageQueries = ({
  dockspaceId,
  selectedAlbumId,
  selectedMediaId,
  duplicatesVisible
}: UseMediaPageQueriesParams) => {
  const mediaQuery = useMediaFiles(dockspaceId);
  const mediaDuplicatesQuery = useMediaDuplicates(dockspaceId, 20, !selectedAlbumId && duplicatesVisible);
  const albumsQuery = useAlbums(dockspaceId);
  const selectedAlbumMediaQuery = useAlbumMedia(dockspaceId, selectedAlbumId);
  const selectedMediaAlbumsQuery = useMediaAlbums(dockspaceId, selectedMediaId);

  const albums = albumsQuery.data ?? [];
  const allMedia = useMemo(
    () => mediaQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [mediaQuery.data]
  );
  const mediaItems = selectedAlbumId ? (selectedAlbumMediaQuery.data ?? []) : allMedia;
  const mediaById = useMemo(() => {
    const map = new Map<string, (typeof mediaItems)[number]>();
    for (const item of allMedia) {
      map.set(item.fileNodeId, item);
    }
    for (const item of mediaItems) {
      map.set(item.fileNodeId, item);
    }
    return map;
  }, [allMedia, mediaItems]);

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

  const selectedMediaAlbums = selectedMediaAlbumsQuery.data ?? [];
  const selectedMediaAlbumIds = useMemo(
    () => new Set(selectedMediaAlbums.map((album) => album.albumId)),
    [selectedMediaAlbums]
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

  const unauthorized =
    (mediaQuery.error instanceof ApiError && mediaQuery.error.statusCode === 403) ||
    (albumsQuery.error instanceof ApiError && albumsQuery.error.statusCode === 403) ||
    (mediaDuplicatesQuery.error instanceof ApiError && mediaDuplicatesQuery.error.statusCode === 403);

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

  return {
    mediaQuery,
    mediaDuplicatesQuery,
    albums,
    allMedia,
    mediaItems,
    mediaById,
    selectedMedia,
    selectedMediaPreviewFile,
    selectedMediaAlbums,
    selectedMediaAlbumIds,
    duplicateGroups,
    duplicateSummary,
    unauthorized,
    mediaListError,
    duplicatesListError,
    mediaHasNextPage,
    mediaIsFetchingNextPage,
    mediaListIsLoading
  };
};
