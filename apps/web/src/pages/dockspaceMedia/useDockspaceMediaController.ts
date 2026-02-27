import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/apiClient';
import { isLikelyMediaFile } from '@/lib/fileContentType';
import { useMoveToTrash, useTrashFilesBatch, useUploadFile } from '@/hooks/useFiles';
import { useDockspaceUploadDialog } from '@/hooks/useDockspaceUploadDialog';
import { useAssignAlbumMedia, useRemoveAlbumMedia } from '@/hooks/useMedia';
import type { MediaGridSize } from '@/pages/dockspaceMedia/mediaTypes';
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
  const [bulkAlbumId, setBulkAlbumId] = useState('');
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [duplicateActionMessage, setDuplicateActionMessage] = useState<string | null>(null);
  const [bulkActionMessage, setBulkActionMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const uploadDialog = useDockspaceUploadDialog({
    currentFolderPath: '/',
    uploadFile: uploadFileMutation.mutateAsync
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

  const uploadErrorMessage =
    localError ??
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
    setBulkAlbumId('');
  }, [selectionState]);

  const onLoadMoreMedia = useCallback(() => {
    if (!mediaData.mediaHasNextPage || mediaData.mediaIsFetchingNextPage) {
      return;
    }

    void mediaData.mediaQuery.fetchNextPage();
  }, [mediaData.mediaHasNextPage, mediaData.mediaIsFetchingNextPage, mediaData.mediaQuery.fetchNextPage]);

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
    uploadDialog.clearValidationError();
    setLocalError(null);
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

  const onSelectAlbum = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value.trim();
      setSelectedAlbumId(value || null);
      setDuplicateActionMessage(null);
      setBulkActionMessage(null);
      setDuplicatesVisible(false);
      resetMultiSelectionState();
    },
    [resetMultiSelectionState]
  );

  const onToggleMultiSelectMode = useCallback(() => {
    setIsMultiSelectMode((previous) => {
      const next = !previous;
      if (!next) {
        selectionState.clearSelection();
        setBulkAlbumId('');
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
      const failedCount = result.failed.length;
      if (failedCount > 0) {
        setBulkActionMessage(`Moved ${result.movedPaths.length} items to trash. ${failedCount} failed.`);
      } else {
        setBulkActionMessage(`Moved ${result.movedPaths.length} items to trash.`);
      }
      resetMultiSelectionState();
    } catch (error) {
      setBulkActionMessage(
        error instanceof Error ? error.message : 'Failed to move selected media to trash.'
      );
    }
  }, [resetMultiSelectionState, selectedMediaPaths, trashFilesBatchMutation]);

  const onAddBulkSelectionToAlbum = useCallback(async () => {
    if (!bulkAlbumId || !selectedMediaFileNodeIds.length || assignAlbumMediaMutation.isPending) {
      return;
    }

    try {
      setBulkActionMessage(null);
      await assignAlbumMediaMutation.mutateAsync({
        albumId: bulkAlbumId,
        fileNodeIds: selectedMediaFileNodeIds
      });
      setBulkActionMessage(
        `Added ${selectedMediaFileNodeIds.length} item${selectedMediaFileNodeIds.length === 1 ? '' : 's'} to album.`
      );
      resetMultiSelectionState();
    } catch (error) {
      setBulkActionMessage(error instanceof Error ? error.message : 'Failed to add selected media to album.');
    }
  }, [assignAlbumMediaMutation, bulkAlbumId, resetMultiSelectionState, selectedMediaFileNodeIds]);

  const onTrashSelectedDuplicates = useCallback(async () => {
    if (!duplicateSelectionState.selectedDuplicatePaths.length || trashFilesBatchMutation.isPending) {
      return;
    }

    try {
      setDuplicateActionMessage(null);
      const result = await trashFilesBatchMutation.mutateAsync(duplicateSelectionState.selectedDuplicatePaths);
      const failedCount = result.failed.length;
      if (failedCount > 0) {
        setDuplicateActionMessage(`Moved ${result.movedPaths.length} items to trash. ${failedCount} failed.`);
      } else {
        setDuplicateActionMessage(`Moved ${result.movedPaths.length} items to trash.`);
      }
    } catch (error) {
      setDuplicateActionMessage(
        error instanceof Error ? error.message : 'Failed to move selected duplicates to trash.'
      );
    }
  }, [duplicateSelectionState.selectedDuplicatePaths, trashFilesBatchMutation]);

  const onLoadMoreDuplicateGroups = useCallback(() => {
    if (!mediaData.mediaDuplicatesQuery.hasNextPage || mediaData.mediaDuplicatesQuery.isFetchingNextPage) {
      return;
    }

    void mediaData.mediaDuplicatesQuery.fetchNextPage();
  }, [mediaData.mediaDuplicatesQuery.fetchNextPage, mediaData.mediaDuplicatesQuery.hasNextPage, mediaData.mediaDuplicatesQuery.isFetchingNextPage]);

  return {
    mediaGridSize,
    setMediaGridSize,
    duplicatesVisible,
    isMultiSelectMode,
    selectedMediaIds: selectionState.selectedMediaIds,
    selectedMediaIdSet: selectionState.selectedMediaIdSet,
    bulkAlbumId,
    setBulkAlbumId,
    selectedAlbumId,
    selectedMediaId,
    setSelectedMediaId,
    localError,
    duplicateActionMessage,
    bulkActionMessage,
    duplicateSelections: duplicateSelectionState.duplicateSelections,
    viewerFile: previewState.viewerFile,
    viewerThumbnailUrl: previewState.viewerThumbnailUrl,
    fileInputRef,
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
    membershipMutationPending,
    mediaListError: mediaData.mediaListError,
    duplicatesListError: mediaData.duplicatesListError,
    mediaHasNextPage: mediaData.mediaHasNextPage,
    mediaIsFetchingNextPage: mediaData.mediaIsFetchingNextPage,
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
    onUploadButtonClick,
    onToggleDuplicates,
    onSelectAllMedia,
    onSelectAlbum,
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
    openPreview: previewState.openPreview,
    closePreview: previewState.closePreview
  };
};

export type DockspaceMediaController = ReturnType<typeof useDockspaceMediaController>;
