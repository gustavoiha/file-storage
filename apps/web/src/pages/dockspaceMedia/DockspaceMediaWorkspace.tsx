import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { CheckSquare, Upload, X } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  focusIsLost,
  isFocusable,
  useDialogDismiss,
  useDialogTabTrap
} from '@/components/files/useDialogDismiss';
import { UploadsCard } from '@/components/files/UploadsCard';
import { PHONE_LAYOUT_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { GALLERY_ALBUM_TRIGGER_CLASS, GalleryAlbumMenu } from '@/pages/dockspaceMedia/GalleryAlbumMenu';
import { GalleryOptionsMenu } from '@/pages/dockspaceMedia/GalleryOptionsMenu';
import { MEDIA_GRID_SIZE_OPTIONS } from '@/pages/dockspaceMedia/mediaGridConfig';
import {
  formatBytes,
  formatDuplicateGroupDetails,
  formatDuplicateGroupsFound,
  formatDuplicatesSelectedForTrashMessage,
  formatRepeatedFiles,
  formatTimestamp,
  formatTrashDialogDescription
} from '@/pages/dockspaceMedia/mediaHelpers';
import { VirtualizedMediaGrid } from '@/pages/dockspaceMedia/VirtualizedMediaGrid';
import type { DockspaceMediaController } from '@/pages/dockspaceMedia/useDockspaceMediaController';

interface DockspaceMediaWorkspaceProps {
  dockspaceId: string;
  controller: DockspaceMediaController;
}

export const DockspaceMediaWorkspace = ({ dockspaceId, controller }: DockspaceMediaWorkspaceProps) => {
  const {
    mediaGridSize,
    setMediaGridSize,
    duplicatesVisible,
    isMultiSelectMode,
    selectedMediaIds,
    selectedMediaIdSet,
    selectedAlbumId,
    setSelectedMediaId,
    localError,
    duplicateActionMessage,
    bulkActionMessage,
    duplicateSelections,
    fileInputRef,
    mediaGridFocusRef,
    galleryFallbackFocusRef,
    uploadDialog,
    albums,
    mediaItems,
    duplicateGroups,
    duplicateSummary,
    selectedDuplicatePaths,
    uploadErrorMessage,
    uploadNoticeMessage,
    mediaListError,
    mediaNextPageError,
    duplicatesListError,
    mediaHasNextPage,
    mediaIsFetchingNextPage,
    mediaIsFetching,
    mediaListIsLoading,
    showBulkActions,
    isAssignAlbumMediaPending,
    isTrashFilesBatchPending,
    isDuplicatesLoading,
    hasMoreDuplicateGroups,
    isLoadingMoreDuplicateGroups,
    onLoadMoreDuplicateGroups,
    onLoadMoreMedia,
    onRetryNextMediaPage,
    onUploadButtonClick,
    onToggleDuplicates,
    onSelectAllMedia,
    onSelectAlbumById,
    onToggleMultiSelectMode,
    onToggleMediaSelection,
    onMediaFileInputChange,
    onMoveBulkSelectionToTrash,
    onAddBulkSelectionToAlbum,
    onSelectDuplicateKeeper,
    onToggleDuplicateSelection,
    onTrashSelectedDuplicates,
    openPreview
  } = controller;
  const [isAddToAlbumDialogOpen, setIsAddToAlbumDialogOpen] = useState(false);
  const [selectedBulkAlbumId, setSelectedBulkAlbumId] = useState('');
  const [trashDialogContext, setTrashDialogContext] = useState<'bulk' | 'duplicates' | null>(null);
  const isTrashDialogOpen = trashDialogContext !== null;
  const trashDialogSelectedCount =
    trashDialogContext === 'duplicates' ? selectedDuplicatePaths.length : selectedMediaIds.length;
  const closeAddToAlbumDialog = useCallback(() => {
    setIsAddToAlbumDialogOpen(false);
  }, []);
  const closeTrashDialog = useCallback(() => {
    setTrashDialogContext(null);
  }, []);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const moveDuplicatesButtonRef = useRef<HTMLButtonElement>(null);
  const duplicatesSummaryRef = useRef<HTMLDivElement>(null);
  // Which entry point the trash dialog was last opened from: it is already null when the dialog's close focus runs.
  const lastTrashDialogContextRef = useRef(trashDialogContext);
  if (trashDialogContext) {
    lastTrashDialogContextRef.current = trashDialogContext;
  }

  // Where focus goes when the trash dialog closes. Escape, Cancel and the backdrop leave the opener in place, so
  // focus returns to it (undefined). After a confirmed trash the opener can be gone or disabled: in the gallery the
  // selection ends and the album button replaces the selection bar; in Find duplicates Move selected to trash is
  // disabled once nothing is left selected, so the duplicates summary (always shown with the list) takes focus.
  const getTrashReturnFocusTarget = useCallback((): HTMLElement | undefined => {
    if (lastTrashDialogContextRef.current === 'duplicates') {
      if (isFocusable(moveDuplicatesButtonRef.current)) {
        return undefined;
      }

      return duplicatesSummaryRef.current ?? undefined;
    }

    return toolbarRef.current?.querySelector<HTMLElement>(`.${GALLERY_ALBUM_TRIGGER_CLASS}`) ?? undefined;
  }, []);
  const { onBackdropMouseDown: onAddToAlbumBackdropMouseDown } = useDialogDismiss({
    isOpen: isAddToAlbumDialogOpen,
    onClose: closeAddToAlbumDialog
  });
  const { onBackdropMouseDown: onTrashBackdropMouseDown } = useDialogDismiss({
    isOpen: isTrashDialogOpen,
    onClose: closeTrashDialog,
    getReturnFocusTarget: getTrashReturnFocusTarget
  });
  const addToAlbumDialogRef = useDialogTabTrap<HTMLDialogElement>(isAddToAlbumDialogOpen);
  const trashDialogRef = useDialogTabTrap<HTMLDialogElement>(isTrashDialogOpen);

  useEffect(() => {
    if (showBulkActions) {
      return;
    }

    setIsAddToAlbumDialogOpen(false);
    setTrashDialogContext((previous) => (previous === 'bulk' ? null : previous));
  }, [showBulkActions]);

  useEffect(() => {
    if (!isAddToAlbumDialogOpen) {
      return;
    }

    const albumStillExists = albums.some((album) => album.albumId === selectedBulkAlbumId);
    if (albumStillExists) {
      return;
    }

    setSelectedBulkAlbumId(albums[0]?.albumId ?? '');
  }, [albums, isAddToAlbumDialogOpen, selectedBulkAlbumId]);

  const openAddToAlbumDialog = useCallback(() => {
    setSelectedBulkAlbumId((previous) => {
      const albumStillExists = albums.some((album) => album.albumId === previous);
      if (albumStillExists) {
        return previous;
      }

      return albums[0]?.albumId ?? '';
    });
    setIsAddToAlbumDialogOpen(true);
  }, [albums]);

  const onConfirmAddToAlbum = useCallback(async () => {
    if (!selectedBulkAlbumId || !selectedMediaIds.length) {
      return;
    }

    await onAddBulkSelectionToAlbum(selectedBulkAlbumId);
    setIsAddToAlbumDialogOpen(false);
  }, [onAddBulkSelectionToAlbum, selectedBulkAlbumId, selectedMediaIds.length]);

  const onConfirmTrashSelection = useCallback(async () => {
    if (trashDialogContext === 'duplicates') {
      await onTrashSelectedDuplicates();
      setTrashDialogContext(null);
      return;
    }

    if (trashDialogContext === 'bulk') {
      await onMoveBulkSelectionToTrash();
      setTrashDialogContext(null);
    }
  }, [onMoveBulkSelectionToTrash, onTrashSelectedDuplicates, trashDialogContext]);

  const isPhone = useMediaQuery(PHONE_LAYOUT_QUERY);
  const uploadButtonRef = useRef<HTMLButtonElement>(null);
  const selectedCountLabel = `${selectedMediaIds.length} item${selectedMediaIds.length === 1 ? '' : 's'} selected`;

  // Entering or leaving selection mode swaps the album button and the selection bar. When the control that did it
  // went away with them (Select items in the ⋯ menu, Cancel, a bulk action that ends selection), focus moves to the
  // control that replaced it instead of falling to <body>.
  const previousShowBulkActionsRef = useRef(showBulkActions);
  useEffect(() => {
    if (previousShowBulkActionsRef.current === showBulkActions) {
      return;
    }

    previousShowBulkActionsRef.current = showBulkActions;
    if (!focusIsLost()) {
      return;
    }

    const selector = showBulkActions ? '.media-workspace__bulk-cancel' : `.${GALLERY_ALBUM_TRIGGER_CLASS}`;
    toolbarRef.current?.querySelector<HTMLElement>(selector)?.focus();
  }, [showBulkActions]);

  // Focus target when the preview closes and no grid is rendered (an empty album, the list emptied while the preview
  // was open). Desktop: the Select multiple toggle. Phone: the album button, or Cancel in selection mode.
  const selectToggleRef = useRef<HTMLButtonElement>(null);
  useImperativeHandle(
    galleryFallbackFocusRef,
    () => ({
      focus: () => {
        if (selectToggleRef.current) {
          selectToggleRef.current.focus();
          return;
        }

        const selector = showBulkActions ? '.media-workspace__bulk-cancel' : `.${GALLERY_ALBUM_TRIGGER_CLASS}`;
        toolbarRef.current?.querySelector<HTMLElement>(selector)?.focus();
      }
    }),
    [showBulkActions]
  );

  // Dismiss removes itself (and the card, when nothing else is in it): focus moves to the Upload button first.
  const onDismissSkippedUploads = useCallback(() => {
    uploadButtonRef.current?.focus();
    uploadDialog.clearSkippedUploads();
  }, [uploadDialog]);

  const uploadsCard = (
    <UploadsCard
      activeUploads={uploadDialog.activeUploads}
      skippedUploads={uploadDialog.skippedUploads}
      isPreparingFolders={Boolean(uploadDialog.isPreparingFolders)}
      uploadErrorMessage={uploadErrorMessage}
      uploadNoticeMessage={uploadNoticeMessage}
      defaultCollapsed={isPhone}
      onDismissSkippedUploads={onDismissSkippedUploads}
      onRetryUpload={uploadDialog.retryUpload}
    />
  );

  const selectionActions = (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={openAddToAlbumDialog}
        disabled={!selectedMediaIds.length || !albums.length || isAssignAlbumMediaPending}
      >
        Add to album
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setTrashDialogContext('bulk')}
        disabled={!selectedMediaIds.length || isTrashFilesBatchPending}
      >
        Trash selected
      </Button>
    </>
  );
  const cancelSelectionButton = (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="media-workspace__bulk-cancel"
      onClick={onToggleMultiSelectMode}
    >
      Cancel
    </Button>
  );

  const sizeToggle = (
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
  );

  const optionsMenu = (
    <GalleryOptionsMenu
      dockspaceId={dockspaceId}
      isInAlbum={Boolean(selectedAlbumId)}
      duplicatesVisible={duplicatesVisible}
      onToggleDuplicates={onToggleDuplicates}
      onStartSelection={isPhone && !isMultiSelectMode ? onToggleMultiSelectMode : undefined}
    />
  );

  const albumMenu = (
    <GalleryAlbumMenu
      albums={albums}
      selectedAlbumId={selectedAlbumId}
      isPhone={isPhone}
      onSelectAllMedia={onSelectAllMedia}
      onSelectAlbumById={onSelectAlbumById}
    />
  );

  const toolbar = isPhone ? (
    showBulkActions ? (
      <div ref={toolbarRef} className="media-workspace__main-controls" data-bulk-actions="true">
        <div className="media-workspace__bulk-actions media-workspace__bulk-actions--phone">
          <div className="media-workspace__bulk-row">
            <p className="media-workspace__bulk-meta">{selectedCountLabel}</p>
            {cancelSelectionButton}
          </div>
          <div className="media-workspace__bulk-row">{selectionActions}</div>
        </div>
      </div>
    ) : (
      <div ref={toolbarRef} className="media-workspace__main-controls" data-bulk-actions="false">
        {albumMenu}
        <div className="media-workspace__control-actions">
          {sizeToggle}
          {optionsMenu}
        </div>
      </div>
    )
  ) : (
    <div
      ref={toolbarRef}
      className="media-workspace__main-controls"
      data-bulk-actions={showBulkActions ? 'true' : 'false'}
    >
      {showBulkActions ? (
        <div className="media-workspace__bulk-actions">
          <p className="media-workspace__bulk-meta">{selectedCountLabel}</p>
          {selectionActions}
          {cancelSelectionButton}
        </div>
      ) : (
        albumMenu
      )}
      <div className="media-workspace__control-actions">
        <button
          ref={selectToggleRef}
          type="button"
          className="media-grid-size-toggle__button media-workspace__icon-action"
          aria-label={isMultiSelectMode ? 'Cancel selection' : 'Select multiple'}
          title={isMultiSelectMode ? 'Cancel selection' : 'Select multiple'}
          aria-pressed={isMultiSelectMode}
          data-active={isMultiSelectMode}
          onClick={onToggleMultiSelectMode}
        >
          {isMultiSelectMode ? <X size={16} /> : <CheckSquare size={16} />}
        </button>
        {sizeToggle}
        <Button
          ref={uploadButtonRef}
          type="button"
          variant="primary"
          className="media-workspace__upload"
          onClick={onUploadButtonClick}
        >
          <Upload size={15} aria-hidden="true" />
          Upload
        </Button>
        {optionsMenu}
      </div>
    </div>
  );

  const hasAlerts = Boolean(
    mediaListError || (duplicatesVisible && duplicatesListError) || bulkActionMessage || localError
  );

  return (
    <div className={`media-workspace${isPhone ? ' media-workspace--phone' : ''}`}>
      <input
        ref={fileInputRef}
        className="dockspace-files__hidden-input"
        type="file"
        multiple
        accept="image/*,video/*"
        onChange={onMediaFileInputChange}
      />

      {hasAlerts ? (
        <div className="media-workspace__alerts">
          {mediaListError ? <Alert message={mediaListError} /> : null}
          {duplicatesVisible && duplicatesListError ? <Alert message={duplicatesListError} /> : null}
          {bulkActionMessage ? <Alert tone={bulkActionMessage.tone} message={bulkActionMessage.message} /> : null}
          {localError ? <Alert message={localError} /> : null}
        </div>
      ) : null}

      <section className="media-workspace__main">
        {toolbar}
        {!selectedAlbumId && duplicatesVisible ? (
          <div className="media-duplicates">
            {/* Takes focus (tabIndex -1) after a confirmed trash that leaves Move selected to trash disabled. */}
            <div ref={duplicatesSummaryRef} className="media-duplicates__summary" tabIndex={-1}>
              <p>{formatDuplicateGroupsFound(duplicateSummary.groupCount)}</p>
              <p>{formatRepeatedFiles(duplicateSummary.duplicateItemCount)}</p>
              <p>{formatBytes(duplicateSummary.reclaimableBytes)} reclaimable.</p>
            </div>
            {duplicateActionMessage ? (
              <Alert tone={duplicateActionMessage.tone} message={duplicateActionMessage.message} />
            ) : null}
            {isDuplicatesLoading ? (
              <p>Loading duplicates...</p>
            ) : duplicateGroups.length === 0 ? (
              <p>No duplicate media files found.</p>
            ) : (
              <ul className="media-duplicates__groups">
                {duplicateGroups.map((group) => {
                  const selection = duplicateSelections[group.contentHash];
                  const keeperFileNodeId =
                    selection?.keeperFileNodeId ?? group.defaultKeeperFileNodeId;
                  const selectedForTrash = new Set(selection?.selectedForTrashFileNodeIds ?? []);

                  return (
                    <li key={group.contentHash} className="media-duplicates__group">
                      <p className="media-duplicates__group-title">
                        Hash {group.contentHash.slice(0, 12)}...
                      </p>
                      <p className="media-duplicates__group-meta">
                        {formatDuplicateGroupDetails(group.items.length, group.reclaimableBytes)}
                      </p>
                      <ul className="media-duplicates__items">
                        {group.items.map((item) => (
                          <li key={item.fileNodeId} className="media-duplicates__item">
                            <div className="media-duplicates__item-main">
                              <span>{item.fullPath.split('/').filter(Boolean).slice(-1)[0] ?? item.fullPath}</span>
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
            {hasMoreDuplicateGroups ? (
              <Button
                type="button"
                variant="secondary"
                onClick={onLoadMoreDuplicateGroups}
                disabled={isLoadingMoreDuplicateGroups}
              >
                {isLoadingMoreDuplicateGroups ? 'Loading...' : 'Load more'}
              </Button>
            ) : null}
            <div className="media-duplicates__footer">
              <p>{formatDuplicatesSelectedForTrashMessage(selectedDuplicatePaths.length)}</p>
              <Button
                ref={moveDuplicatesButtonRef}
                type="button"
                variant="secondary"
                onClick={() => setTrashDialogContext('duplicates')}
                disabled={isTrashFilesBatchPending || selectedDuplicatePaths.length === 0}
              >
                Move selected to trash
              </Button>
            </div>
          </div>
        ) : mediaListIsLoading ? (
          <p className="media-workspace__message">Loading media...</p>
        ) : mediaItems.length === 0 ? (
          <p className="media-workspace__message">
            {selectedAlbumId ? 'This album has no media yet.' : 'No media files available.'}
          </p>
        ) : (
          <VirtualizedMediaGrid
            key={selectedAlbumId ?? 'all-media'}
            items={mediaItems}
            gridSize={mediaGridSize}
            isMultiSelectMode={isMultiSelectMode}
            selectedMediaIds={selectedMediaIdSet}
            onSelectMedia={setSelectedMediaId}
            onToggleMediaSelection={onToggleMediaSelection}
            onOpenPreview={openPreview}
            hasNextPage={mediaHasNextPage}
            isFetchingNextPage={mediaIsFetchingNextPage}
            isFetching={mediaIsFetching}
            onLoadMore={onLoadMoreMedia}
            nextPageError={mediaNextPageError}
            onRetryNextPage={onRetryNextMediaPage}
            focusHandleRef={mediaGridFocusRef}
          />
        )}
      </section>

      {isPhone ? (
        <div className="media-workspace__floating media-workspace__floating--phone">
          {uploadsCard}
          <Button
            ref={uploadButtonRef}
            type="button"
            variant="primary"
            className="media-workspace__upload media-workspace__upload-pill"
            onClick={onUploadButtonClick}
          >
            <Upload size={15} aria-hidden="true" />
            Upload
          </Button>
        </div>
      ) : (
        <div className="media-workspace__floating">{uploadsCard}</div>
      )}

      {isAddToAlbumDialogOpen ? (
        <div className="dockspace-dialog-backdrop" onMouseDown={onAddToAlbumBackdropMouseDown}>
          <dialog
            ref={addToAlbumDialogRef}
            className="dockspace-dialog"
            open
            aria-modal="true"
            aria-label="Add selected media to album"
            onCancel={(event) => {
              event.preventDefault();
              closeAddToAlbumDialog();
            }}
          >
            <h2 className="dockspace-dialog__title">Add to album</h2>
            <p className="dockspace-dialog__description">
              Choose the album for {selectedMediaIds.length} selected item
              {selectedMediaIds.length === 1 ? '' : 's'}.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void onConfirmAddToAlbum();
              }}
            >
              <label className="ui-field" htmlFor="bulk-album-target">
                <span className="ui-field__label">Album</span>
                <select
                  id="bulk-album-target"
                  className="ui-input"
                  value={selectedBulkAlbumId}
                  onChange={(event) => setSelectedBulkAlbumId(event.target.value)}
                  autoFocus
                  disabled={isAssignAlbumMediaPending || !albums.length}
                >
                  {albums.map((album) => (
                    <option key={album.albumId} value={album.albumId}>
                      {album.name}
                    </option>
                  ))}
                </select>
              </label>
              {!albums.length ? (
                <p className="dockspace-dialog__description">Create an album first to organize selections.</p>
              ) : null}
              <div className="dockspace-dialog__actions">
                <Button type="button" variant="secondary" onClick={closeAddToAlbumDialog}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!selectedBulkAlbumId || !selectedMediaIds.length || isAssignAlbumMediaPending}
                >
                  {isAssignAlbumMediaPending ? 'Adding...' : 'Add selected items'}
                </Button>
              </div>
            </form>
          </dialog>
        </div>
      ) : null}

      {isTrashDialogOpen ? (
        <div className="dockspace-dialog-backdrop" onMouseDown={onTrashBackdropMouseDown}>
          <dialog
            ref={trashDialogRef}
            className="dockspace-dialog"
            open
            aria-modal="true"
            aria-label="Confirm moving items to trash"
            onCancel={(event) => {
              event.preventDefault();
              closeTrashDialog();
            }}
          >
            <h2 className="dockspace-dialog__title">Move to trash</h2>
            <p className="dockspace-dialog__description">
              {formatTrashDialogDescription(trashDialogSelectedCount, trashDialogContext ?? 'bulk')}
            </p>
            <div className="dockspace-dialog__actions">
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  void onConfirmTrashSelection();
                }}
                disabled={isTrashFilesBatchPending || trashDialogSelectedCount === 0}
              >
                {isTrashFilesBatchPending ? 'Moving...' : 'Move to trash'}
              </Button>
              {/* Initial focus on Cancel: pressing Enter right after opening must not trash anything. Cancel stays
                  enabled while the request runs, so the Tab trap always has a control to move focus to. */}
              <Button type="button" variant="secondary" onClick={closeTrashDialog} autoFocus>
                Cancel
              </Button>
            </div>
          </dialog>
        </div>
      ) : null}
    </div>
  );
};
