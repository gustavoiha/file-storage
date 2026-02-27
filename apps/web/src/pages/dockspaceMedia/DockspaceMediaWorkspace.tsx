import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { CheckSquare, Upload, X } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useDialogDismiss } from '@/components/files/useDialogDismiss';
import { UploadStagingList } from '@/components/files/UploadStagingList';
import { MEDIA_GRID_SIZE_OPTIONS } from '@/pages/dockspaceMedia/mediaGridConfig';
import { formatBytes, formatTimestamp } from '@/pages/dockspaceMedia/mediaHelpers';
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
    selectedMediaId,
    setSelectedMediaId,
    localError,
    duplicateActionMessage,
    bulkActionMessage,
    duplicateSelections,
    fileInputRef,
    uploadDialog,
    albums,
    mediaItems,
    duplicateGroups,
    duplicateSummary,
    selectedDuplicatePaths,
    uploadErrorMessage,
    mediaListError,
    duplicatesListError,
    mediaHasNextPage,
    mediaIsFetchingNextPage,
    mediaListIsLoading,
    showBulkActions,
    isAssignAlbumMediaPending,
    isTrashFilesBatchPending,
    isDuplicatesLoading,
    hasMoreDuplicateGroups,
    isLoadingMoreDuplicateGroups,
    onLoadMoreDuplicateGroups,
    onLoadMoreMedia,
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
  const selectedAlbumName =
    (selectedAlbumId ? albums.find((album) => album.albumId === selectedAlbumId)?.name : null) ?? null;
  const isTrashDialogOpen = trashDialogContext !== null;
  const trashDialogSelectedCount =
    trashDialogContext === 'duplicates' ? selectedDuplicatePaths.length : selectedMediaIds.length;
  const trashDialogSelectionLabel =
    trashDialogContext === 'duplicates' ? 'selected duplicate media files' : 'selected media files';
  const closeAddToAlbumDialog = useCallback(() => {
    setIsAddToAlbumDialogOpen(false);
  }, []);
  const closeTrashDialog = useCallback(() => {
    setTrashDialogContext(null);
  }, []);
  const { onBackdropMouseDown: onAddToAlbumBackdropMouseDown } = useDialogDismiss({
    isOpen: isAddToAlbumDialogOpen,
    onClose: closeAddToAlbumDialog
  });
  const { onBackdropMouseDown: onTrashBackdropMouseDown } = useDialogDismiss({
    isOpen: isTrashDialogOpen,
    onClose: closeTrashDialog
  });

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

  return (
    <div className="media-workspace">
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
      {bulkActionMessage ? <Alert tone="info" message={bulkActionMessage} /> : null}
      {localError && localError !== uploadErrorMessage ? <Alert message={localError} /> : null}

      <div className="dockspace-page-shell media-workspace-shell">
        <div className="dockspace-page-main">
          <section className="media-workspace__main">
            <div
              className="media-workspace__main-controls"
              data-bulk-actions={showBulkActions ? 'true' : 'false'}
            >
              <div className="media-workspace__heading-slot">
                {showBulkActions ? (
                  <div className="media-workspace__bulk-actions media-workspace__bulk-actions--inline">
                    <p className="media-workspace__bulk-meta">
                      {selectedMediaIds.length} item{selectedMediaIds.length === 1 ? '' : 's'} selected
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={openAddToAlbumDialog}
                      disabled={!selectedMediaIds.length || !albums.length || isAssignAlbumMediaPending}
                    >
                      Add to album
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setTrashDialogContext('bulk')}
                      disabled={!selectedMediaIds.length || isTrashFilesBatchPending}
                    >
                      Trash selected
                    </Button>
                    <Button type="button" variant="secondary" onClick={onToggleMultiSelectMode}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <p className="media-workspace__active-source">
                    {selectedAlbumName ? `Album: ${selectedAlbumName}` : 'All media'}
                  </p>
                )}
              </div>
              <div className="media-workspace__control-actions">
                <button
                  type="button"
                  className="media-grid-size-toggle__button media-workspace__icon-action"
                  aria-label="Upload media"
                  title="Upload media"
                  onClick={onUploadButtonClick}
                >
                  <Upload size={16} />
                </button>
                <button
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
            </div>

            {!selectedAlbumId && duplicatesVisible ? (
              <div className="media-duplicates">
                <div className="media-duplicates__summary">
                  <p>{duplicateSummary.groupCount} duplicate groups found.</p>
                  <p>{duplicateSummary.duplicateItemCount} repeated files.</p>
                  <p>{formatBytes(duplicateSummary.reclaimableBytes)} reclaimable.</p>
                </div>
                {duplicateActionMessage ? <Alert message={duplicateActionMessage} /> : null}
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
                            {group.items.length} files, {formatBytes(group.reclaimableBytes)} reclaimable
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
                  <p>{selectedDuplicatePaths.length} items selected for trash.</p>
                  <Button
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
              <p>Loading media...</p>
            ) : mediaItems.length === 0 ? (
              <p>{selectedAlbumId ? 'This album has no media yet.' : 'No media files available.'}</p>
            ) : (
              <VirtualizedMediaGrid
                key={selectedAlbumId ?? 'all-media'}
                items={mediaItems}
                gridSize={mediaGridSize}
                isMultiSelectMode={isMultiSelectMode}
                selectedMediaIds={selectedMediaIdSet}
                selectedMediaId={selectedMediaId}
                onSelectMedia={setSelectedMediaId}
                onToggleMediaSelection={onToggleMediaSelection}
                onOpenPreview={openPreview}
                hasNextPage={mediaHasNextPage}
                isFetchingNextPage={mediaIsFetchingNextPage}
                onLoadMore={onLoadMoreMedia}
              />
            )}
          </section>
        </div>

        <aside className="dockspace-sidebar media-workspace__sidebar" aria-label="Media sidebar">
          <div className="dockspace-sidebar__top-scroll">
            <section className="dockspace-sidebar__section">
              <h2 className="dockspace-sidebar__title">Actions</h2>
              <div className="dockspace-sidebar__actions">
                {!selectedAlbumId ? (
                  <Button type="button" variant="secondary" onClick={onToggleDuplicates}>
                    {duplicatesVisible ? 'Browse media' : 'Find duplicates'}
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" onClick={onToggleDuplicates} disabled>
                    Find duplicates
                  </Button>
                )}
                <Link
                  className="dockspace-sidebar__action-link"
                  to="/dockspaces/$dockspaceId/trash"
                  params={{ dockspaceId }}
                >
                  Trash
                </Link>
                <Link
                  className="dockspace-sidebar__action-link"
                  to="/dockspaces/$dockspaceId/usage"
                  params={{ dockspaceId }}
                >
                  Detailed usage
                </Link>
              </div>
            </section>

            <section className="dockspace-sidebar__section dockspace-sidebar__section--folders">
              <h2 className="dockspace-sidebar__title">Albums</h2>
              <ul className="dockspace-sidebar__tree-list media-sidebar__album-list">
                <li className="dockspace-sidebar__tree-item">
                  <button
                    type="button"
                    className="media-sidebar__album-button"
                    data-active={!selectedAlbumId}
                    onClick={onSelectAllMedia}
                  >
                    <span className="media-sidebar__album-name">All media</span>
                  </button>
                </li>
                {albums.map((album) => (
                  <li key={album.albumId} className="dockspace-sidebar__tree-item">
                    <button
                      type="button"
                      className="media-sidebar__album-button"
                      data-active={selectedAlbumId === album.albumId}
                      onClick={() => onSelectAlbumById(album.albumId)}
                    >
                      <span className="media-sidebar__album-name">{album.name}</span>
                      {typeof album.mediaCount === 'number' ? (
                        <span className="dockspace-sidebar__tree-count">{album.mediaCount}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="dockspace-sidebar__section dockspace-sidebar__section--uploads" aria-live="polite">
            <div className="dockspace-sidebar__uploads-header">
              <h2 className="dockspace-sidebar__title">Uploads</h2>
              <span className="dockspace-sidebar__uploads-count">{uploadDialog.activeUploads.length}</span>
            </div>
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
                <Button type="button" variant="secondary" onClick={uploadDialog.clearSkippedUploads}>
                  Dismiss
                </Button>
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      {isAddToAlbumDialogOpen ? (
        <div className="dockspace-dialog-backdrop" onMouseDown={onAddToAlbumBackdropMouseDown}>
          <dialog
            className="dockspace-dialog"
            open
            aria-modal="true"
            aria-label="Add selected media to album"
            onCancel={(event) => {
              event.preventDefault();
              closeAddToAlbumDialog();
            }}
          >
            <h3 className="dockspace-dialog__title">Add to album</h3>
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
            className="dockspace-dialog"
            open
            aria-modal="true"
            aria-label="Confirm moving items to trash"
            onCancel={(event) => {
              event.preventDefault();
              closeTrashDialog();
            }}
          >
            <h3 className="dockspace-dialog__title">Move to trash</h3>
            <p className="dockspace-dialog__description">
              This will move {trashDialogSelectedCount} {trashDialogSelectionLabel} to trash.
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
              <Button type="button" variant="secondary" onClick={closeTrashDialog}>
                Cancel
              </Button>
            </div>
          </dialog>
        </div>
      ) : null}
    </div>
  );
};
