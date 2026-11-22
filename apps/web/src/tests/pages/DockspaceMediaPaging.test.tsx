import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DockspaceMediaPage } from '@/pages/DockspaceMediaPage';
import { VirtualizedMediaGrid } from '@/pages/dockspaceMedia/VirtualizedMediaGrid';
import { MEDIA_GRID_GAP_PX, MEDIA_GRID_LAYOUT } from '@/pages/dockspaceMedia/mediaGridConfig';
import { MEDIA_PAGE_SIZE } from '@/hooks/useMedia';
import { clearSession, setSession } from '@/lib/authStore';
import type { MediaFileRecord, MediaListResponse } from '@/lib/apiTypes';
import { createTestQueryClient, QueryWrapper } from '@/tests/testUtils';

// Paging through the real React Query infinite query, with the API mocked. The grid's scroll box measures
// 800 x 600 (4 medium columns, rows of 198px + 12px gap) and the window is 768px tall, so the lookahead is
// 2 x 768 = 1536px while not scrolling.
const api = vi.hoisted(() => ({
  pages: new Map<string | undefined, () => Promise<MediaListResponse>>(),
  listMedia: vi.fn(),
  inFlight: 0,
  maxInFlight: 0
}));

const buildItems = (start: number, count: number): MediaFileRecord[] =>
  Array.from({ length: count }, (_, offset) => {
    const n = String(start + offset).padStart(4, '0');
    return {
      fileNodeId: `file-${n}`,
      fullPath: `/photos/item-${n}.jpg`,
      size: 1_000,
      contentType: 'image/jpeg',
      contentHash: `hash-${n}`,
      updatedAt: '2026-02-01T00:00:00.000Z',
      state: 'ACTIVE'
    };
  });

vi.mock('@/lib/dockspaceApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dockspaceApi')>()),
  listMedia: api.listMedia,
  listAlbums: vi.fn(async () => []),
  listAlbumMedia: vi.fn(async () => []),
  listMediaAlbums: vi.fn(async () => []),
  listMediaDuplicates: vi.fn(async () => ({
    items: [],
    summary: { groupCount: 0, duplicateItemCount: 0, reclaimableBytes: 0 }
  }))
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/files/FileViewerDialog', () => ({
  FileViewerDialog: () => null
}));

vi.mock('@/components/files/UploadStagingList', () => ({
  UploadStagingList: () => null
}));

vi.mock('@/hooks/useDockspaceUploadDialog', () => ({
  useDockspaceUploadDialog: () => ({
    clearValidationError: vi.fn(),
    validationError: null,
    stageFiles: vi.fn(),
    activeUploads: [],
    retryUpload: vi.fn(),
    skippedUploads: [],
    clearSkippedUploads: vi.fn()
  })
}));

vi.mock('@/hooks/useFiles', () => ({
  useUploadFile: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useMoveToTrash: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useTrashFilesBatch: () => ({ mutateAsync: vi.fn(), isPending: false, error: null })
}));

const BOX_WIDTH = 800;
const BOX_HEIGHT = 600;
const WINDOW_HEIGHT = 768;
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
const originalInnerHeight = window.innerHeight;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return (this as HTMLElement).classList.contains('media-grid-virtual') ? BOX_WIDTH : 0;
    }
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return (this as HTMLElement).classList.contains('media-grid-virtual') ? BOX_HEIGHT : 0;
    }
  });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: WINDOW_HEIGHT });
});

afterAll(() => {
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
  if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
});

/** Pages of `perPage` items, cursors c1, c2, ...; the last page has no cursor. */
const servePages = (pageCount: number, perPage: number) => {
  api.pages.clear();
  for (let index = 0; index < pageCount; index += 1) {
    const cursor = index === 0 ? undefined : `c${index}`;
    const next = index + 1 < pageCount ? `c${index + 1}` : undefined;
    api.pages.set(cursor, async () => ({
      items: buildItems(index * perPage, perPage),
      ...(next ? { nextCursor: next } : {})
    }));
  }
};

const failPage = (cursor: string) => {
  const ok = api.pages.get(cursor);
  api.pages.set(cursor, async () => {
    throw new Error('Network down');
  });
  return () => {
    if (ok) api.pages.set(cursor, ok);
  };
};

/** The next request for `cursor` waits until the returned release function is called (later requests do not). */
const holdNextRequest = (cursor: string | undefined) => {
  const page = api.pages.get(cursor)!;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  api.pages.set(cursor, async () => {
    api.pages.set(cursor, page);
    await gate;
    return page();
  });
  return () => act(() => release());
};

const requestedCursors = () => api.listMedia.mock.calls.map(([, options]) => options?.cursor);

const settle = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
});

const renderPage = (client = createTestQueryClient()) =>
  render(
    <QueryWrapper client={client}>
      <DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />
    </QueryWrapper>
  );

describe('Media gallery paging', () => {
  beforeEach(() => {
    setSession({ accessToken: 'a', idToken: 'i', email: 'a@a.com', userId: 'u1' });
    api.inFlight = 0;
    api.maxInFlight = 0;
    api.listMedia.mockReset();
    api.listMedia.mockImplementation(async (_dockspaceId: string, options?: { cursor?: string }) => {
      api.inFlight += 1;
      api.maxInFlight = Math.max(api.maxInFlight, api.inFlight);
      try {
        await new Promise((resolve) => setTimeout(resolve, 1));
        const page = api.pages.get(options?.cursor);
        if (!page) throw new Error(`unexpected cursor ${options?.cursor}`);
        return await page();
      } finally {
        api.inFlight -= 1;
      }
    });
  });

  afterEach(() => {
    cleanup();
    clearSession();
  });

  it('asks for pages larger than 60 items', async () => {
    servePages(1, 8);
    renderPage();
    await waitFor(() => expect(api.listMedia).toHaveBeenCalled());
    expect(MEDIA_PAGE_SIZE).toBeGreaterThan(60);
    expect(MEDIA_PAGE_SIZE).toBeLessThanOrEqual(200);
    expect(api.listMedia.mock.calls[0]?.[1]).toEqual({ limit: MEDIA_PAGE_SIZE });
  });

  it('keeps requesting pages, one at a time, until the lookahead is filled, without scroll events', async () => {
    // 8 items = 2 rows = 420px per page. After n pages the content is n * 420 - 12 px tall; 600px of it is in view.
    // 5 pages leave 1488px below the viewport (< 1536), 6 pages leave 1908px: so exactly 6 requests.
    servePages(20, 8);
    renderPage();

    await waitFor(() => expect(api.listMedia).toHaveBeenCalledTimes(6));
    await settle();
    await settle();
    expect(api.listMedia).toHaveBeenCalledTimes(6);
    expect(requestedCursors()).toEqual([undefined, 'c1', 'c2', 'c3', 'c4', 'c5']);
    expect(api.maxInFlight).toBe(1);

    // Scrolling further requests more.
    const scroller = document.querySelector('.media-grid-virtual') as HTMLElement;
    fireEvent.scroll(scroller, { target: { scrollTop: 1_000 } });
    await waitFor(() => expect(api.listMedia.mock.calls.length).toBeGreaterThan(6));
    expect(api.maxInFlight).toBe(1);
  });

  it('stops loading after a failed next page, shows Try again at the end, and resumes after a successful retry', async () => {
    servePages(20, 8);
    const restore = failPage('c2');
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load more media. Network down");
    // At the end of the grid, inside the scroll box; no second alert above the gallery.
    expect(alert.closest('.media-grid-virtual__footer')).not.toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(requestedCursors()).toEqual([undefined, 'c1', 'c2']);
    // The loaded tiles stay.
    expect(screen.getByRole('button', { name: 'Open item-0000.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open item-0015.jpg' })).toBeInTheDocument();

    // No request loop: time passing, re-renders and scroll events do not retry on their own.
    const scroller = document.querySelector('.media-grid-virtual') as HTMLElement;
    await settle();
    fireEvent.scroll(scroller, { target: { scrollTop: 10 } });
    fireEvent.scroll(scroller, { target: { scrollTop: 20 } });
    await settle();
    expect(api.listMedia).toHaveBeenCalledTimes(3);

    // Try again: one request per press, focus stays on the (busy) button while it runs and after it fails.
    const tryAgain = within(alert).getByRole('button', { name: 'Try again' });
    tryAgain.focus();
    fireEvent.click(tryAgain);
    const busy = await within(screen.getByRole('alert')).findByRole('button', { name: 'Trying again…' });
    expect(busy).toBe(tryAgain);
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(busy); // ignored while busy
    expect(document.activeElement).toBe(tryAgain);
    await waitFor(() => expect(tryAgain).not.toHaveAttribute('aria-disabled'));
    expect(api.listMedia).toHaveBeenCalledTimes(4);
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    expect(document.activeElement).toBe(tryAgain);
    await settle();
    expect(api.listMedia).toHaveBeenCalledTimes(4);

    // A successful retry removes the error, moves focus to the first tile it loaded, and automatic loading resumes.
    restore();
    fireEvent.click(tryAgain);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open item-0016.jpg' }));
    await waitFor(() => expect(api.listMedia).toHaveBeenCalledTimes(8));
    expect(requestedCursors()).toEqual([undefined, 'c1', 'c2', 'c2', 'c2', 'c3', 'c4', 'c5']);
    expect(api.maxInFlight).toBe(1);
  });

  it('asks for the next page when a background refetch ends, if the bottom was reached during it', async () => {
    servePages(20, 8);
    const client = createTestQueryClient();
    renderPage(client);
    await waitFor(() => expect(api.listMedia).toHaveBeenCalledTimes(6));
    await settle();

    // A background refetch (window focus, or an invalidation after an upload) re-requests the 6 loaded pages.
    const releaseRefetch = holdNextRequest(undefined);
    act(() => {
      void client.invalidateQueries({ queryKey: ['media'] });
    });
    await waitFor(() => expect(api.listMedia).toHaveBeenCalledTimes(7));

    // The user reaches the bottom during the refetch and stops scrolling: no next page is asked for yet, and the
    // reserved footer says why.
    const scroller = document.querySelector('.media-grid-virtual') as HTMLElement;
    const status = scroller.querySelector('.media-grid-virtual__footer [role="status"]') as HTMLElement;
    expect(status).toHaveTextContent('Loading more media...');
    fireEvent.scroll(scroller, { target: { scrollTop: 6 * 420 - 12 - BOX_HEIGHT } });
    await settle();
    expect(api.listMedia).toHaveBeenCalledTimes(7);
    expect(status).toHaveTextContent('Loading more media...');

    // When the refetch ends, the next page is requested with no further scroll event.
    await releaseRefetch();
    await waitFor(() => expect(requestedCursors()).toContain('c6'));
    expect(requestedCursors().slice(6, 13)).toEqual([undefined, 'c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
    expect(api.maxInFlight).toBe(1);

    // Once the lookahead is filled and nothing is loading, the status is empty again.
    await waitFor(() => expect(status.textContent).toBe(''));
    await settle();
    expect(api.inFlight).toBe(0);
    expect(status.textContent).toBe('');
  });

  it('keeps Try again busy during a background refetch, and a press then sends nothing', async () => {
    servePages(20, 8);
    const restore = failPage('c2');
    const client = createTestQueryClient();
    renderPage(client);
    const tryAgain = await within(await screen.findByRole('alert')).findByRole('button', { name: 'Try again' });
    expect(requestedCursors()).toEqual([undefined, 'c1', 'c2']);

    const releaseRefetch = holdNextRequest(undefined);
    act(() => {
      void client.invalidateQueries({ queryKey: ['media'] });
    });
    await waitFor(() => expect(api.listMedia).toHaveBeenCalledTimes(4));

    // The error and its button stay; the button is busy and ignores presses.
    tryAgain.focus();
    expect(tryAgain).toHaveAttribute('aria-disabled', 'true');
    expect(tryAgain).toHaveTextContent('Trying again…');
    fireEvent.click(tryAgain);
    await settle();
    expect(api.listMedia).toHaveBeenCalledTimes(4);
    expect(document.activeElement).toBe(tryAgain);
    // The error says what happened: no loading text next to it while the refetch runs.
    expect(screen.getByRole('status').textContent).toBe('');

    // The refetch succeeds, which clears the error: automatic loading resumes with one request for the next page.
    restore();
    await releaseRefetch();
    await waitFor(() => expect(requestedCursors()).toContain('c3'));
    expect(requestedCursors().slice(3, 6)).toEqual([undefined, 'c1', 'c2']);
    expect(api.maxInFlight).toBe(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('moves focus to the old last tile when a successful retry loads no new tiles', async () => {
    servePages(3, 8);
    const restore = failPage('c2');
    renderPage();
    const tryAgain = await within(await screen.findByRole('alert')).findByRole('button', { name: 'Try again' });

    // The retried page comes back empty and is the last one.
    restore();
    api.pages.set('c2', async () => ({ items: [] }));
    tryAgain.focus();
    fireEvent.click(tryAgain);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    // The busy button is removed with the error, so focus would have fallen to <body>.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open item-0015.jpg' }));
  });

  it('moves focus to the scroll box when the user scrolled away from the end while the retry ran', async () => {
    // 6 pages fill the lookahead; the 6th (c5) fails, so 5 pages = 40 tiles = 10 rows are loaded.
    servePages(20, 8);
    const restore = failPage('c5');
    renderPage();
    const tryAgain = await within(await screen.findByRole('alert')).findByRole('button', { name: 'Try again' });
    const scroller = document.querySelector('.media-grid-virtual') as HTMLElement;
    fireEvent.scroll(scroller, { target: { scrollTop: 10 * 210 - 12 - BOX_HEIGHT } });

    restore();
    const releaseRetry = holdNextRequest('c5');
    tryAgain.focus();
    fireEvent.click(tryAgain);
    await waitFor(() => expect(tryAgain).toHaveAttribute('aria-disabled', 'true'));

    // While the retry runs, the user scrolls back to the top: tiles 39 and 40 leave the rendered rows.
    fireEvent.scroll(scroller, { target: { scrollTop: 0 } });
    // Success removes the error with the focused button, so focus falls to <body> first.
    await releaseRetry();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(scroller.querySelector('[data-media-index="39"]')).toBeNull();
    expect(scroller.querySelector('[data-media-index="40"]')).toBeNull();
    expect(document.activeElement).toBe(scroller);
    expect(scroller).toHaveAttribute('tabindex', '-1');
  });

  it('does not request anything when there is no next page', async () => {
    servePages(1, 8);
    renderPage();
    await screen.findByRole('button', { name: 'Open item-0007.jpg' });
    await settle();
    expect(api.listMedia).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.media-grid-virtual__footer')).toBeNull();
  });

  it('announces loading politely in a reserved slot only while a page loads', async () => {
    servePages(3, 8);
    let release: (() => void) | undefined;
    const page2 = api.pages.get('c1')!;
    api.pages.set('c1', () => new Promise((resolve) => (release = () => resolve(page2()))));
    renderPage();

    const status = await screen.findByRole('status');
    await waitFor(() => expect(status).toHaveTextContent('Loading more media...'));
    expect(status.closest('.media-grid-virtual__footer')).not.toBeNull();
    act(() => release?.());
    await waitFor(() => expect(api.listMedia).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(document.querySelector('.media-grid-virtual__footer')).toBeNull());
  });
});

describe('VirtualizedMediaGrid row layout', () => {
  afterEach(() => cleanup());

  it('shows no loading status during a refetch when there is no next page (the end of the list, or an album)', () => {
    // Album views pass hasNextPage false: the album list is not paged.
    render(
      <VirtualizedMediaGrid
        items={buildItems(0, 8)}
        gridSize="medium"
        isMultiSelectMode={false}
        selectedMediaIds={new Set()}
        selectedMediaId={null}
        onSelectMedia={vi.fn()}
        onToggleMediaSelection={vi.fn()}
        onOpenPreview={vi.fn()}
        hasNextPage={false}
        isFetchingNextPage={false}
        isFetching
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Loading more media...')).toBeNull();
  });

  it('positions rows with the same gap the list uses, so the window can move without shifting tiles', () => {
    const { rowHeightPx } = MEDIA_GRID_LAYOUT.medium;
    const stride = rowHeightPx + MEDIA_GRID_GAP_PX;
    const items = buildItems(0, 400); // 4 columns -> 100 rows
    render(
      <VirtualizedMediaGrid
        items={items}
        gridSize="medium"
        isMultiSelectMode={false}
        selectedMediaIds={new Set()}
        selectedMediaId={null}
        onSelectMedia={vi.fn()}
        onToggleMediaSelection={vi.fn()}
        onOpenPreview={vi.fn()}
        hasNextPage={false}
        isFetchingNextPage={false}
        onLoadMore={vi.fn()}
      />
    );

    const scroller = document.querySelector('.media-grid-virtual') as HTMLElement;
    const list = scroller.querySelector('ul') as HTMLElement;
    expect(list.style.gap).toBe(`${MEDIA_GRID_GAP_PX}px`);
    const totalHeight = 100 * stride - MEDIA_GRID_GAP_PX;

    for (const scrollTop of [0, stride * 5 - 1, stride * 5, stride * 5 + 40, stride * 37 + 100]) {
      fireEvent.scroll(scroller, { target: { scrollTop } });
      const spacers = scroller.querySelectorAll<HTMLElement>('.media-grid-virtual__spacer');
      const first = list.querySelector('[data-media-index]') as HTMLElement;
      const firstRow = Number(first.dataset.mediaIndex) / 4;
      const renderedRows = list.querySelectorAll('li').length / 4;
      const top = firstRow > 0 ? Number.parseFloat(spacers[0]!.style.height) : 0;
      const bottom = Number.parseFloat(spacers[spacers.length - 1]!.style.height);

      // The first rendered row starts where it would in the full list, and everything adds up to the full height.
      expect(top).toBe(firstRow * stride);
      expect(top + renderedRows * rowHeightPx + (renderedRows - 1) * MEDIA_GRID_GAP_PX + bottom).toBe(totalHeight);
    }
  });
});
