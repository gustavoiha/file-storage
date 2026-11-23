import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/apiClient';
import { pluralize } from '@/lib/fileFormat';
import type { MediaFileRecord } from '@/lib/apiTypes';
import { isLikelyMediaFile } from '@/lib/fileContentType';
import { useMoveToTrash, useTrashFilesBatch, useUploadFile } from '@/hooks/useFiles';
import { useDockspaceUploadDialog } from '@/hooks/useDockspaceUploadDialog';
import {
  useAssignAlbumMedia,
  useRefreshMediaAfterUploads,
  useRemoveAlbumMedia
} from '@/hooks/useMedia';
import {
  formatSkippedNonMediaFilesMessage,
  trashResultActionMessage
} from '@/pages/dockspaceMedia/mediaHelpers';
import type { MediaActionMessage, MediaGridSize } from '@/pages/dockspaceMedia/mediaTypes';
import type { MediaGridFocusHandle } from '@/pages/dockspaceMedia/VirtualizedMediaGrid';
import { useDuplicateSelectionState } from '@/pages/dockspaceMedia/useDuplicateSelectionState';
import { useMediaPageQueries } from '@/pages/dockspaceMedia/useMediaPageQueries';
import { useMediaPreviewState } from '@/pages/dockspaceMedia/useMediaPreviewState';
import { useMediaSelectionState } from '@/pages/dockspaceMedia/useMediaSelectionState';

interface UseDockspaceMediaControllerParams {
  dockspaceId: string;
}

export const useDockspaceMediaController = ({ dockspaceId }: UseDockspaceMediaControllerParams) => {
  const [mediaGridSize, setMediaGridSize] = useState<MediaGridSize>('medium');
  const [duplicatesVisible, setDuplicatesVisible] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  // Files the media input skipped (not images or videos): shown in the uploads card, not with the page's other errors.
  const [uploadSelectionNotice, setUploadSelectionNotice] = useState<string | null>(null);
  const [duplicateActionMessage, setDuplicateActionMessage] = useState<MediaActionMessage | null>(null);
  const [bulkActionMessage, setBulkActionMessage] = useState<MediaActionMessage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Where focus goes when the preview closes: the grid's tile for the item shown last (or its scroll box), else,
  // when no grid is rendered, a toolbar control the workspace picks (it is always rendered above the grid).
  const mediaGridFocusRef = useRef<MediaGridFocusHandle>(null);
  const galleryFallbackFocusRef = useRef<{ focus: () => void }>(null);

  const mediaData = useMediaPageQueries({
    dockspaceId,
    selectedAlbumId,
    selectedMediaId,
    duplicatesVisible
  });

  const selectionState = useMediaSelectionState({
    mediaItems: mediaData.mediaItems,
    mediaById: mediaData.mediaById
  });

  const duplicateSelectionState = useDuplicateSelectionState({
    duplicateGroups: mediaData.duplicateGroups
  });

  const previewState = useMediaPreviewState();

  const assignAlbumMediaMutation = useAssignAlbumMedia(dockspaceId);
  const removeAlbumMediaMutation = useRemoveAlbumMedia(dockspaceId);
  const uploadFileMutation = useUploadFile(dockspaceId, '/');
  const moveToTrashMutation = useMoveToTrash(dockspaceId, '/');
  const trashFilesBatchMutation = useTrashFilesBatch(dockspaceId);
  const refreshMediaAfterUploads = useRefreshMediaAfterUploads(dockspaceId);

  const uploadDialog = useDockspaceUploadDialog({
    currentFolderPath: '/',
    uploadFile: uploadFileMutation.mutateAsync,
    // One gallery refetch when a batch of uploads finishes, not one per file (the gallery is paged), then a bounded
    // follow-up for the new items' thumbnails, which are made asynchronously after the upload.
    onBatchComplete: (_uploadedCount, uploadedPaths) => {
      void refreshMediaAfterUploads(uploadedPaths);
    }
  });

  const selectedMediaRecords = useMemo(
    () =>
      selectionState.selectedMediaIds
        .map((fileNodeId) => mediaData.mediaById.get(fileNodeId))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [mediaData.mediaById, selectionState.selectedMediaIds]
  );

  const selectedMediaPaths = useMemo(
    () => Array.from(new Set(selectedMediaRecords.map((item) => item.fullPath))),
    [selectedMediaRecords]
  );

  const selectedMediaFileNodeIds = useMemo(
    () => selectedMediaRecords.map((item) => item.fileNodeId),
    [selectedMediaRecords]
  );

  const membershipMutationPending =
    assignAlbumMediaMutation.isPending || removeAlbumMediaMutation.isPending;

  // Files left out of a pick (non-media files, invalid upload paths) are a notice, not an error: the uploads card gets
  // them separately so it does not report them as a failed upload, and neither hides the other.
  const uploadNoticeMessage =
    [uploadSelectionNotice, uploadDialog.invalidPathsNotice].filter(Boolean).join(' ') || null;
  const uploadErrorMessage =
    uploadDialog.validationError ??
    (uploadFileMutation.error instanceof ApiError &&
    uploadFileMutation.error.code === 'UPLOAD_SKIPPED_DUPLICATE'
      ? null
      : uploadFileMutation.error instanceof Error
      ? uploadFileMutation.error.message
      : null);

  const showBulkActions = isMultiSelectMode;

  const resetMultiSelectionState = useCallback(() => {
    setIsMultiSelectMode(false);
    selectionState.clearSelection();
  }, [selectionState]);

  // Automatic loading: never while any request of the query is in flight (a next page, or a background refetch,
  // which a fetchNextPage with cancelRefetch: false would only join, sending no next-page request), and never after
  // a next page failed (Try again resumes it). The grid asks again once the in-flight request settles.
  const onLoadMoreMedia = useCallback(() => {
    if (!mediaData.mediaHasNextPage || mediaData.mediaIsFetching || mediaData.mediaNextPageError) {
      return;
    }

    void mediaData.mediaQuery.fetchNextPage({ cancelRefetch: false });
  }, [
    mediaData.mediaHasNextPage,
    mediaData.mediaIsFetching,
    mediaData.mediaNextPageError,
    mediaData.mediaQuery.fetchNextPage
  ]);

  // Try again after a failed next page: one request per press. The grid shows the button busy while any request is
  // in flight, and a press then does nothing.
  const onRetryNextMediaPage = useCallback(() => {
    if (mediaData.mediaIsFetching) {
      return;
    }

    void mediaData.mediaQuery.fetchNextPage({ cancelRefetch: false });
  }, [mediaData.mediaIsFetching, mediaData.mediaQuery.fetchNextPage]);

  useEffect(() => {
    if (!selectedMediaId) {
      return;
    }

    const selectedExists =
      mediaData.mediaItems.some((item) => item.fileNodeId === selectedMediaId) ||
      mediaData.allMedia.some((item) => item.fileNodeId === selectedMediaId);

    if (!selectedExists) {
      setSelectedMediaId(null);
    }
  }, [mediaData.allMedia, mediaData.mediaItems, selectedMediaId]);

  useEffect(() => {
    if (selectedAlbumId && !mediaData.albums.some((album) => album.albumId === selectedAlbumId)) {
      setSelectedAlbumId(null);
    }
  }, [mediaData.albums, selectedAlbumId]);

  const onUploadButtonClick = useCallback(() => {
    uploadDialog.clearUploadMessages();
    setUploadSelectionNotice(null);
    fileInputRef.current?.click();
  }, [uploadDialog]);

  const onToggleDuplicates = useCallback(() => {
    setDuplicateActionMessage(null);
    setBulkActionMessage(null);
    resetMultiSelectionState();
    setDuplicatesVisible((previous) => !previous);
  }, [resetMultiSelectionState]);

  const onSelectAllMedia = useCallback(() => {
    setSelectedAlbumId(null);
    setDuplicateActionMessage(null);
    setBulkActionMessage(null);
    resetMultiSelectionState();
  }, [resetMultiSelectionState]);

  const onSelectAlbumById = useCallback(
    (albumId: string | null) => {
      const value = albumId?.trim() ?? '';
      setSelectedAlbumId(value || null);
      setDuplicateActionMessage(null);
      setBulkActionMessage(null);
      setDuplicatesVisible(false);
      resetMultiSelectionState();
    },
    [resetMultiSelectionState]
  );

  const onSelectAlbum = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onSelectAlbumById(event.target.value);
    },
    [onSelectAlbumById]
  );

  const onToggleMultiSelectMode = useCallback(() => {
    setIsMultiSelectMode((previous) => {
      const next = !previous;
      if (!next) {
        selectionState.clearSelection();
      } else {
        setSelectedMediaId(null);
        setDuplicatesVisible(false);
        selectionState.resetAnchor();
      }
      setBulkActionMessage(null);
      return next;
    });
  }, [selectionState]);

  const onMediaFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      if (!selectedFiles.length) {
        return;
      }

      const mediaFiles = selectedFiles.filter(isLikelyMediaFile);
      const rejectedCount = selectedFiles.length - mediaFiles.length;

      if (rejectedCount > 0) {
        setUploadSelectionNotice(formatSkippedNonMediaFilesMessage(rejectedCount));
      } else {
        setUploadSelectionNotice(null);
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
      if (!mediaData.selectedMedia) {
        return;
      }

      try {
        setLocalError(null);
        if (assigned) {
          await removeAlbumMediaMutation.mutateAsync({
            albumId,
            fileNodeId: mediaData.selectedMedia.fileNodeId
          });
          return;
        }

        await assignAlbumMediaMutation.mutateAsync({
          albumId,
          fileNodeIds: [mediaData.selectedMedia.fileNodeId]
        });
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : 'Failed to update album membership.');
      }
    },
    [assignAlbumMediaMutation, mediaData.selectedMedia, removeAlbumMediaMutation]
  );

  const onMoveSelectedMediaToTrash = useCallback(async () => {
    if (!mediaData.selectedMedia) {
      return;
    }

    try {
      setLocalError(null);
      await moveToTrashMutation.mutateAsync({
        fullPath: mediaData.selectedMedia.fullPath,
        targetType: 'file'
      });
      setSelectedMediaId(null);
      previewState.clearPreview();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to move media to trash.');
    }
  }, [mediaData.selectedMedia, moveToTrashMutation, previewState]);

  const onMoveBulkSelectionToTrash = useCallback(async () => {
    if (!selectedMediaPaths.length || trashFilesBatchMutation.isPending) {
      return;
    }

    try {
      setBulkActionMessage(null);
      const result = await trashFilesBatchMutation.mutateAsync(selectedMediaPaths);
      setBulkActionMessage(trashResultActionMessage(result.movedPaths.length, result.failed.length));
      resetMultiSelectionState();
    } catch (error) {
      setBulkActionMessage({
        message: error instanceof Error ? error.message : 'Failed to move selected media to trash.',
        tone: 'error'
      });
    }
  }, [resetMultiSelectionState, selectedMediaPaths, trashFilesBatchMutation]);

  const onAddBulkSelectionToAlbum = useCallback(async (albumId: string) => {
    const trimmedAlbumId = albumId.trim();
    if (!trimmedAlbumId || !selectedMediaFileNodeIds.length || assignAlbumMediaMutation.isPending) {
      return;
    }

    try {
      setBulkActionMessage(null);
      await assignAlbumMediaMutation.mutateAsync({
        albumId: trimmedAlbumId,
        fileNodeIds: selectedMediaFileNodeIds
      });
      setBulkActionMessage({
        message: `Added ${pluralize(selectedMediaFileNodeIds.length, 'item')} to album.`,
        tone: 'info'
      });
      resetMultiSelectionState();
    } catch (error) {
      setBulkActionMessage({
        message: error instanceof Error ? error.message : 'Failed to add selected media to album.',
        tone: 'error'
      });
    }
  }, [assignAlbumMediaMutation, resetMultiSelectionState, selectedMediaFileNodeIds]);

  const onTrashSelectedDuplicates = useCallback(async () => {
    if (!duplicateSelectionState.selectedDuplicatePaths.length || trashFilesBatchMutation.isPending) {
      return;
    }

    try {
      setDuplicateActionMessage(null);
      const result = await trashFilesBatchMutation.mutateAsync(duplicateSelectionState.selectedDuplicatePaths);
      setDuplicateActionMessage(trashResultActionMessage(result.movedPaths.length, result.failed.length));
    } catch (error) {
      setDuplicateActionMessage({
        message: error instanceof Error ? error.message : 'Failed to move selected duplicates to trash.',
        tone: 'error'
      });
    }
  }, [duplicateSelectionState.selectedDuplicatePaths, trashFilesBatchMutation]);

  const onLoadMoreDuplicateGroups = useCallback(() => {
    if (!mediaData.mediaDuplicatesQuery.hasNextPage || mediaData.mediaDuplicatesQuery.isFetchingNextPage) {
      return;
    }

    void mediaData.mediaDuplicatesQuery.fetchNextPage();
  }, [mediaData.mediaDuplicatesQuery.fetchNextPage, mediaData.mediaDuplicatesQuery.hasNextPage, mediaData.mediaDuplicatesQuery.isFetchingNextPage]);

  const onOpenPreview = useCallback(
    (item: MediaFileRecord) => {
      setSelectedMediaId(item.fileNodeId);
      previewState.openPreview(item, mediaData.mediaItems);
    },
    [mediaData.mediaItems, previewState]
  );

  const lastShownMediaId = previewState.viewerFile?.fileNodeId ?? null;
  const closePreviewState = previewState.closePreview;
  const onClosePreview = useCallback(() => {
    closePreviewState();
    if (!lastShownMediaId) {
      return;
    }

    // Before the preview unmounts, so focus never falls to <body> (the close button had it).
    if (mediaGridFocusRef.current) {
      mediaGridFocusRef.current.focusItem(lastShownMediaId);
    } else {
      galleryFallbackFocusRef.current?.focus();
    }
  }, [closePreviewState, lastShownMediaId]);

  return {
    mediaGridSize,
    setMediaGridSize,
    duplicatesVisible,
    isMultiSelectMode,
    selectedMediaIds: selectionState.selectedMediaIds,
    selectedMediaIdSet: selectionState.selectedMediaIdSet,
    selectedAlbumId,
    selectedMediaId,
    setSelectedMediaId,
    localError,
    duplicateActionMessage,
    bulkActionMessage,
    duplicateSelections: duplicateSelectionState.duplicateSelections,
    viewerFile: previewState.viewerFile,
    viewerThumbnailUrl: previewState.viewerThumbnailUrl,
    canPreviewPrevious: previewState.canPreviewPrevious,
    canPreviewNext: previewState.canPreviewNext,
    fileInputRef,
    mediaGridFocusRef,
    galleryFallbackFocusRef,
    uploadDialog,
    albums: mediaData.albums,
    mediaItems: mediaData.mediaItems,
    selectedMedia: mediaData.selectedMedia,
    selectedMediaPreviewFile: mediaData.selectedMediaPreviewFile,
    selectedMediaAlbums: mediaData.selectedMediaAlbums,
    selectedMediaAlbumIds: mediaData.selectedMediaAlbumIds,
    duplicateGroups: mediaData.duplicateGroups,
    duplicateSummary: mediaData.duplicateSummary,
    selectedDuplicatePaths: duplicateSelectionState.selectedDuplicatePaths,
    unauthorized: mediaData.unauthorized,
    uploadErrorMessage,
    uploadNoticeMessage,
    membershipMutationPending,
    mediaListError: mediaData.mediaListError,
    mediaNextPageError: mediaData.mediaNextPageError,
    duplicatesListError: mediaData.duplicatesListError,
    mediaHasNextPage: mediaData.mediaHasNextPage,
    mediaIsFetchingNextPage: mediaData.mediaIsFetchingNextPage,
    mediaIsFetching: mediaData.mediaIsFetching,
    mediaListIsLoading: mediaData.mediaListIsLoading,
    showBulkActions,
    isAssignAlbumMediaPending: assignAlbumMediaMutation.isPending,
    isTrashFilesBatchPending: trashFilesBatchMutation.isPending,
    isMoveToTrashPending: moveToTrashMutation.isPending,
    isDuplicatesLoading: mediaData.mediaDuplicatesQuery.isLoading,
    hasMoreDuplicateGroups: Boolean(mediaData.mediaDuplicatesQuery.hasNextPage),
    isLoadingMoreDuplicateGroups: mediaData.mediaDuplicatesQuery.isFetchingNextPage,
    onLoadMoreDuplicateGroups,
    onLoadMoreMedia,
    onRetryNextMediaPage,
    onUploadButtonClick,
    onToggleDuplicates,
    onSelectAllMedia,
    onSelectAlbum,
    onSelectAlbumById,
    onToggleMultiSelectMode,
    onToggleMediaSelection: selectionState.onToggleMediaSelection,
    onMediaFileInputChange,
    onToggleMembership,
    onMoveSelectedMediaToTrash,
    onMoveBulkSelectionToTrash,
    onAddBulkSelectionToAlbum,
    onSelectDuplicateKeeper: duplicateSelectionState.onSelectDuplicateKeeper,
    onToggleDuplicateSelection: duplicateSelectionState.onToggleDuplicateSelection,
    onTrashSelectedDuplicates,
    openPreview: onOpenPreview,
    openPreviousPreview: previewState.openPreviousPreview,
    openNextPreview: previewState.openNextPreview,
    closePreview: onClosePreview
  };
};

export type DockspaceMediaController = ReturnType<typeof useDockspaceMediaController>;
