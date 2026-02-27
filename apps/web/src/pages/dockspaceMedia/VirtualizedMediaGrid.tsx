import { useEffect, useRef, useState } from 'react';
import { Film, Image as ImageIcon } from 'lucide-react';
import {
  MEDIA_GRID_GAP_PX,
  MEDIA_GRID_LAYOUT,
  MEDIA_GRID_OVERSCAN_ROWS
} from '@/pages/dockspaceMedia/mediaGridConfig';
import { basename } from '@/pages/dockspaceMedia/mediaHelpers';
import type { MediaSelectionOptions, MediaGridSize } from '@/pages/dockspaceMedia/mediaTypes';
import type { MediaFileRecord } from '@/lib/apiTypes';

interface VirtualizedMediaGridProps {
  items: MediaFileRecord[];
  gridSize: MediaGridSize;
  isMultiSelectMode: boolean;
  selectedMediaIds: Set<string>;
  selectedMediaId: string | null;
  onSelectMedia: (fileNodeId: string) => void;
  onToggleMediaSelection: (fileNodeId: string, options?: MediaSelectionOptions) => void;
  onOpenPreview: (item: MediaFileRecord) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}

export const VirtualizedMediaGrid = ({
  items,
  gridSize,
  isMultiSelectMode,
  selectedMediaIds,
  selectedMediaId,
  onSelectMedia,
  onToggleMediaSelection,
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
        {visibleItems.map((item, index) => {
          const absoluteIndex = visibleStartIndex + index;
          const selected = isMultiSelectMode
            ? selectedMediaIds.has(item.fileNodeId)
            : selectedMediaId === item.fileNodeId;
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
                aria-label={`${isMultiSelectMode ? 'Select' : 'Open'} ${basename(item.fullPath)}`}
                aria-pressed={isMultiSelectMode ? selected : undefined}
                onClick={(event) => {
                  if (isMultiSelectMode) {
                    onToggleMediaSelection(item.fileNodeId, {
                      shiftKey: event.shiftKey,
                      itemIndex: absoluteIndex
                    });
                    return;
                  }

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
                {isMultiSelectMode ? (
                  <span className="media-card__selection-indicator" aria-hidden="true">
                    {selected ? '✓' : ''}
                  </span>
                ) : null}
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
