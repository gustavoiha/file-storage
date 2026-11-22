import { useMemo, useState } from 'react';
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

  // A failed next page keeps the loaded tiles and is shown (with Try again) at the end of the grid, not above it.
  // React Query reports isFetchNextPageError only while the last fetch was a next page: a background refetch (e.g.
  // after an upload) clears it while the error stays, so remember it here until the query succeeds again.
  const [rememberedNextPageFailure, setRememberedNextPageFailure] = useState(false);
  const nextPageFailed =
    mediaQuery.status === 'error' && (rememberedNextPageFailure || Boolean(mediaQuery.isFetchNextPageError));
  if (nextPageFailed !== rememberedNextPageFailure) {
    setRememberedNextPageFailure(nextPageFailed);
  }

  const mediaNextPageError =
    !selectedAlbumId && nextPageFailed && mediaQuery.error instanceof Error ? mediaQuery.error.message : null;

  const mediaListError =
    selectedAlbumId && selectedAlbumMediaQuery.error instanceof Error
      ? selectedAlbumMediaQuery.error.message
      : selectedAlbumId || nextPageFailed
      ? null
      : mediaQuery.error instanceof Error
      ? mediaQuery.error.message
      : null;

  const duplicatesListError =
    mediaDuplicatesQuery.error instanceof Error ? mediaDuplicatesQuery.error.message : null;

  const mediaHasNextPage = !selectedAlbumId && Boolean(mediaQuery.hasNextPage);
  const mediaIsFetchingNextPage = !selectedAlbumId && mediaQuery.isFetchingNextPage;
  // Any request of the gallery query: a next page or a background refetch of the loaded pages.
  const mediaIsFetching = !selectedAlbumId && mediaQuery.isFetching;
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
    mediaNextPageError,
    duplicatesListError,
    mediaHasNextPage,
    mediaIsFetchingNextPage,
    mediaIsFetching,
    mediaListIsLoading
  };
};
