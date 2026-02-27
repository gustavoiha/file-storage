import { Link } from '@tanstack/react-router';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FilePreviewContent } from '@/components/files/FilePreviewContent';
import { UploadStagingList } from '@/components/files/UploadStagingList';
import { MEDIA_GRID_SIZE_OPTIONS } from '@/pages/dockspaceMedia/mediaGridConfig';
import { basename, formatBytes, formatTimestamp } from '@/pages/dockspaceMedia/mediaHelpers';
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
    bulkAlbumId,
    setBulkAlbumId,
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
    selectedMedia,
    selectedMediaPreviewFile,
    selectedMediaAlbums,
    selectedMediaAlbumIds,
    duplicateGroups,
    duplicateSummary,
    selectedDuplicatePaths,
    uploadErrorMessage,
    membershipMutationPending,
    mediaListError,
    duplicatesListError,
    mediaHasNextPage,
    mediaIsFetchingNextPage,
    mediaListIsLoading,
    showBulkActions,
    isAssignAlbumMediaPending,
    isTrashFilesBatchPending,
    isMoveToTrashPending,
    isDuplicatesLoading,
    hasMoreDuplicateGroups,
    isLoadingMoreDuplicateGroups,
    onLoadMoreDuplicateGroups,
    onLoadMoreMedia,
    onUploadButtonClick,
    onToggleDuplicates,
    onSelectAllMedia,
    onSelectAlbum,
    onToggleMultiSelectMode,
    onToggleMediaSelection,
    onMediaFileInputChange,
    onToggleMembership,
    onMoveSelectedMediaToTrash,
    onMoveBulkSelectionToTrash,
    onAddBulkSelectionToAlbum,
    onSelectDuplicateKeeper,
    onToggleDuplicateSelection,
    onTrashSelectedDuplicates,
    openPreview
  } = controller;

  return (
    <div className="media-workspace">
      <div className="media-workspace__header">
        {showBulkActions ? (
          <div className="media-workspace__bulk-actions">
            <p className="media-workspace__bulk-meta">
              {selectedMediaIds.length} item{selectedMediaIds.length === 1 ? '' : 's'} selected
            </p>
            <select
              className="media-workspace__bulk-album-select"
              aria-label="Bulk add to album"
              value={bulkAlbumId}
              onChange={(event) => setBulkAlbumId(event.target.value)}
            >
              <option value="">Choose album</option>
              {albums.map((album) => (
                <option key={album.albumId} value={album.albumId}>
                  {album.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              onClick={onAddBulkSelectionToAlbum}
              disabled={!bulkAlbumId || !selectedMediaIds.length || isAssignAlbumMediaPending}
            >
              {isAssignAlbumMediaPending ? 'Adding...' : 'Add to album'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onMoveBulkSelectionToTrash}
              disabled={!selectedMediaIds.length || isTrashFilesBatchPending}
            >
              {isTrashFilesBatchPending ? 'Moving...' : 'Trash selected'}
            </Button>
            <Button type="button" variant="secondary" onClick={onToggleMultiSelectMode}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="media-workspace__actions">
            <Button type="button" onClick={onUploadButtonClick}>
              Upload media
            </Button>
            <Button type="button" variant="secondary" onClick={onToggleMultiSelectMode}>
              Select multiple
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
        )}
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
      {bulkActionMessage ? <Alert tone="info" message={bulkActionMessage} /> : null}
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
                  onClick={onTrashSelectedDuplicates}
                  disabled={isTrashFilesBatchPending || selectedDuplicatePaths.length === 0}
                >
                  {isTrashFilesBatchPending ? 'Moving...' : 'Move selected to trash'}
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
              <Button type="button" variant="secondary" onClick={() => openPreview(selectedMedia)}>
                Open fullscreen
              </Button>
              <p className="media-detail__name">{basename(selectedMedia.fullPath)}</p>
              <p className="media-detail__meta">{formatBytes(selectedMedia.size)}</p>
              <p className="media-detail__meta">{selectedMedia.contentType}</p>

              <div className="media-detail__chips">
                {selectedMediaAlbums.length ? (
                  selectedMediaAlbums.map((album) => (
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
                disabled={isMoveToTrashPending}
              >
                {isMoveToTrashPending ? 'Moving...' : 'Move to trash'}
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
                <Button type="button" variant="secondary" onClick={uploadDialog.clearSkippedUploads}>
                  Dismiss
                </Button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
};
