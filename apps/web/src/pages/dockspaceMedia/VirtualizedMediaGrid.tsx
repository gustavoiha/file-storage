import { type Ref, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { Check, Film, Image as ImageIcon } from 'lucide-react';
import {
  getMediaGridMetrics,
  MEDIA_GRID_GAP_PX,
  MEDIA_GRID_LAYOUT,
  MEDIA_GRID_OVERSCAN_ROWS
} from '@/pages/dockspaceMedia/mediaGridConfig';
import {
  currentScrollSpeed,
  getLoadAheadPx,
  nextScrollSpeedSample,
  shouldLoadNextPage,
  type ScrollSpeedSample
} from '@/pages/dockspaceMedia/mediaGridLoadAhead';
import { basename } from '@/pages/dockspaceMedia/mediaHelpers';
import type { MediaSelectionOptions, MediaGridSize } from '@/pages/dockspaceMedia/mediaTypes';
import type { MediaFileRecord } from '@/lib/apiTypes';
import '@/styles/ui.css';

export interface MediaGridFocusHandle {
  /**
   * Moves focus to the tile of this item (used when the preview closes). A tile outside the rendered rows is scrolled
   * into view first. When the item is not in the grid any more, or its tile still cannot be rendered, focus goes to
   * the scroll box, which is always mounted.
   */
  focusItem: (fileNodeId: string) => void;
}

interface VirtualizedMediaGridProps {
  items: MediaFileRecord[];
  gridSize: MediaGridSize;
  isMultiSelectMode: boolean;
  selectedMediaIds: Set<string>;
  onSelectMedia: (fileNodeId: string) => void;
  onToggleMediaSelection: (fileNodeId: string, options?: MediaSelectionOptions) => void;
  onOpenPreview: (item: MediaFileRecord) => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  /**
   * Any request of the media query in flight (a next page or a background refetch). Defaults to isFetchingNextPage.
   * No next page is asked for while it is true, and the grid asks again when it turns false.
   */
  isFetching?: boolean;
  onLoadMore: () => void;
  /** Message of a failed next-page request: automatic loading stops and the end of the grid offers Try again. */
  nextPageError?: string | null;
  onRetryNextPage?: () => void;
  focusHandleRef?: Ref<MediaGridFocusHandle>;
}

export const VirtualizedMediaGrid = ({
  items,
  gridSize,
  isMultiSelectMode,
  selectedMediaIds,
  onSelectMedia,
  onToggleMediaSelection,
  onOpenPreview,
  hasNextPage,
  isFetchingNextPage,
  isFetching = isFetchingNextPage,
  onLoadMore,
  nextPageError = null,
  onRetryNextPage,
  focusHandleRef
}: VirtualizedMediaGridProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollSpeedRef = useRef<ScrollSpeedSample | null>(null);
  // Whether the end of the loaded items is within the load-ahead distance, as last measured by the load effect below.
  const [isWithinLoadAhead, setIsWithinLoadAhead] = useState(false);
  const minColumnWidthPx = MEDIA_GRID_LAYOUT[gridSize].minColumnWidthPx;

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

  // Square tiles: a row is as tall as a column is wide, so the row size follows the scroll box width (recomputed on
  // every resize). The rows are laid out with a MEDIA_GRID_GAP_PX gap (set inline on the list below, so CSS and this
  // math agree): a row starts every rowStridePx. Using the row height alone as the stride made every tile move by one
  // gap each time a row left the top of the rendered window (a visible jump on iOS, a scroll position correction in
  // Chrome). The gap is 0 today, so the stride is the row height.
  const { columnCount, rowHeightPx, rowStridePx } = getMediaGridMetrics(viewportWidth, minColumnWidthPx);
  const rowCount = Math.ceil(items.length / columnCount);
  const totalHeight = rowCount > 0 ? rowCount * rowStridePx - MEDIA_GRID_GAP_PX : 0;
  const startRow = Math.max(0, Math.floor(scrollTop / rowStridePx) - MEDIA_GRID_OVERSCAN_ROWS);
  const endRow =
    rowCount > 0
      ? Math.min(
          rowCount - 1,
          Math.ceil((scrollTop + viewportHeight) / rowStridePx) + MEDIA_GRID_OVERSCAN_ROWS
        )
      : -1;
  const visibleStartIndex = startRow * columnCount;
  const visibleEndIndex = endRow >= 0 ? Math.min(items.length, (endRow + 1) * columnCount) : 0;
  const visibleItems = items.slice(visibleStartIndex, visibleEndIndex);
  const topSpacerHeight = startRow * rowStridePx;
  // Rows after endRow, each with the gap above it.
  const bottomSpacerHeight = endRow >= 0 ? Math.max(0, (rowCount - 1 - endRow) * rowStridePx) : 0;

  useEffect(() => {
    const remainingPx = totalHeight - (scrollTop + viewportHeight);
    // A viewport height is the taller of the grid's own scroll box and the window.
    const viewportHeightPx = Math.max(viewportHeight, typeof window === 'undefined' ? 0 : window.innerHeight);
    const loadAheadPx = getLoadAheadPx({
      viewportHeightPx,
      scrollSpeedPxPerMs: currentScrollSpeed(scrollSpeedRef.current, performance.now())
    });

    setIsWithinLoadAhead(remainingPx < loadAheadPx);

    if (
      shouldLoadNextPage({
        remainingPx,
        loadAheadPx,
        hasNextPage,
        isFetching,
        hasNextPageError: Boolean(nextPageError)
      })
    ) {
      onLoadMore();
    }
    // isFetching is a dependency so that the end of a background refetch, which changes nothing else here when the
    // user reached the bottom during it and stopped scrolling, still asks for the next page.
  }, [hasNextPage, isFetching, nextPageError, onLoadMore, scrollTop, totalHeight, viewportHeight]);

  // A successful Try again (or a background refetch that succeeds) removes the error and the focused Try again
  // button. If focus fell to <body>, move it to the first tile the retry loaded, else the old last tile (the retry
  // loaded nothing, or the virtual window has moved), else the scroll box itself, which is always rendered: both
  // tiles can be outside the rendered rows when the user scrolled away while the retry ran.
  const previousErrorRef = useRef<{ message: string | null; itemCount: number }>({
    message: nextPageError,
    itemCount: items.length
  });
  useLayoutEffect(() => {
    const previous = previousErrorRef.current;
    previousErrorRef.current = { message: nextPageError, itemCount: items.length };
    if (!previous.message || nextPageError) {
      return;
    }

    const active = document.activeElement;
    if (active && active !== document.body) {
      return;
    }

    const container = containerRef.current;
    const target =
      container?.querySelector<HTMLElement>(`[data-media-index="${previous.itemCount}"]`) ??
      container?.querySelector<HTMLElement>(`[data-media-index="${previous.itemCount - 1}"]`) ??
      container;
    target?.focus();
  }, [items.length, nextPageError]);

  // Focus return when the preview closes (see MediaGridFocusHandle). A tile that is not rendered is scrolled into
  // view: its index waits here until the render with its row, then the layout effect below focuses it.
  const pendingFocusIndexRef = useRef<number | null>(null);
  const focusTile = (index: number): boolean => {
    const tile = containerRef.current?.querySelector<HTMLElement>(`[data-media-index="${index}"]`);
    tile?.focus();
    return Boolean(tile);
  };

  useImperativeHandle(focusHandleRef, () => ({
    focusItem: (fileNodeId: string) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      pendingFocusIndexRef.current = null;
      const index = items.findIndex((item) => item.fileNodeId === fileNodeId);
      if (index < 0) {
        container.focus();
        return;
      }

      if (focusTile(index)) {
        return;
      }

      // Put the tile's row in the middle of the scroll box.
      const row = Math.floor(index / columnCount);
      const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
      const targetScrollTop = Math.min(
        maxScrollTop,
        Math.max(0, Math.round(row * rowStridePx - (viewportHeight - rowHeightPx) / 2))
      );
      if (targetScrollTop === scrollTop) {
        // The rendered rows would not change, so the tile cannot be rendered.
        container.focus();
        return;
      }

      container.scrollTop = targetScrollTop;
      pendingFocusIndexRef.current = index;
      setScrollTop(targetScrollTop);
    }
  }));

  useLayoutEffect(() => {
    const index = pendingFocusIndexRef.current;
    if (index === null) {
      return;
    }

    pendingFocusIndexRef.current = null;
    if (!focusTile(index)) {
      containerRef.current?.focus();
    }
  });

  const showFooter = hasNextPage || Boolean(nextPageError);
  // A background refetch also holds back the next page (it re-requests every loaded page, one after another, which
  // can take a few seconds), so the status shows during it too, not only while the next page itself loads. But only
  // when the grid would ask for the next page now (the end is within the load-ahead distance): elsewhere nothing is
  // held back, and the polite live region would announce a false "Loading more media..." on every upload, trash,
  // album change or return to the tab.
  const showLoadingStatus =
    !nextPageError && (isFetchingNextPage || (hasNextPage && isFetching && isWithinLoadAhead));

  return (
    <div
      ref={containerRef}
      className="media-grid-virtual"
      // Focus fallback after a successful Try again or a closed preview (see above); not in the tab order.
      tabIndex={-1}
      onScroll={(event) => {
        const nextScrollTop = event.currentTarget.scrollTop;
        scrollSpeedRef.current = nextScrollSpeedSample(scrollSpeedRef.current, nextScrollTop, performance.now());
        setScrollTop(nextScrollTop);
      }}
    >
      {topSpacerHeight > 0 ? (
        <div className="media-grid-virtual__spacer" style={{ height: `${topSpacerHeight}px` }} />
      ) : null}

      <ul
        className={`media-grid media-grid--virtual media-grid--${gridSize}`}
        style={{
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
          gap: `${MEDIA_GRID_GAP_PX}px`
        }}
      >
        {visibleItems.map((item, index) => {
          const absoluteIndex = visibleStartIndex + index;
          // Only multi-select picks are marked. The tile last opened in the preview is not: outside selection mode
          // nothing is selected, and focus returns to that tile when the preview closes.
          const selected = isMultiSelectMode && selectedMediaIds.has(item.fileNodeId);
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
                data-media-index={absoluteIndex}
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
                    {selected ? <Check size={14} strokeWidth={3} /> : null}
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

      {showFooter ? (
        // Reserved space at the end of the list: showing or hiding the loading text never changes the scroll height.
        <div className="media-grid-virtual__footer">
          {nextPageError ? (
            <div className="ui-alert ui-alert--error media-grid-virtual__error" role="alert">
              <span>Couldn&apos;t load more media. {nextPageError}</span>{' '}
              {/* aria-disabled, not disabled: a disabled button would drop its focus while the retry runs. */}
              <button
                type="button"
                className="dockspace-link-button"
                // Busy while any request is in flight: a background refetch that succeeds also clears the error.
                aria-disabled={isFetching ? 'true' : undefined}
                aria-busy={isFetching ? 'true' : undefined}
                onClick={() => {
                  if (!isFetching) {
                    onRetryNextPage?.();
                  }
                }}
              >
                {isFetching ? 'Trying again…' : 'Try again'}
              </button>
            </div>
          ) : null}
          <p className="media-grid-virtual__status" role="status">
            {showLoadingStatus ? 'Loading more media...' : ''}
          </p>
        </div>
      ) : null}
    </div>
  );
};
