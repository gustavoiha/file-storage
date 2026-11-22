import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DockspaceMediaPage } from '@/pages/DockspaceMediaPage';
import type { MediaFileRecord } from '@/lib/apiTypes';

// Focus return when the gallery preview closes. The real FileViewerDialog is rendered (its content is mocked).
// The grid's scroll box measures 800 x 600: 4 medium columns of square 200px tiles with no gap (a 200px stride), so
// at scrollTop 0 the rendered rows are 0..5 (3 visible + 2 overscan), i.e. tiles 0..23.
const BOX_WIDTH = 800;
const BOX_HEIGHT = 600;
const ROW_STRIDE_PX = 200;
const ROW_HEIGHT_PX = 200;

const mockState = vi.hoisted(() => ({
  buildMediaItems: (count: number): MediaFileRecord[] =>
    Array.from({ length: count }, (_, index) => {
      const itemNumber = String(index).padStart(4, '0');
      return {
        fileNodeId: `file-${itemNumber}`,
        fullPath: `/photos/item-${itemNumber}.jpg`,
        size: 1_024,
        contentType: 'image/jpeg',
        contentHash: `hash-${itemNumber}`,
        updatedAt: '2026-02-01T00:00:00.000Z',
        state: 'ACTIVE'
      };
    }),
  // Replaced as a whole (never rebuilt per call), so the hook results stay stable between renders.
  mediaData: { pages: [{ items: [] as MediaFileRecord[] }] },
  albumItems: [] as MediaFileRecord[],
  albumsData: [] as Array<{ albumId: string; name: string }>
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/files/FilePreviewContent', () => ({
  FilePreviewContent: ({ file }: { file: { fullPath: string } | null }) => (
    <div data-testid="preview-content">{file?.fullPath ?? ''}</div>
  )
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

vi.mock('@/hooks/useMedia', () => ({
  useMediaFiles: () => ({
    data: mockState.mediaData,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetching: false,
    isLoading: false,
    error: null,
    status: 'success',
    fetchNextPage: vi.fn()
  }),
  useMediaDuplicates: () => ({
    data: undefined,
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    error: null,
    fetchNextPage: vi.fn()
  }),
  useAlbums: () => ({ data: mockState.albumsData, isLoading: false, error: null }),
  useAlbumMedia: (_dockspaceId: string, albumId: string | null) => ({
    data: albumId ? mockState.albumItems : [],
    isLoading: false,
    error: null
  }),
  useMediaAlbums: () => ({ data: [], isLoading: false, error: null }),
  useAssignAlbumMedia: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveAlbumMedia: () => ({ mutateAsync: vi.fn(), isPending: false })
}));

const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

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
});

afterAll(() => {
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
  if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
});

const setMediaItems = (items: MediaFileRecord[]) => {
  mockState.mediaData = { pages: [{ items }] };
};

const scrollBox = () => document.querySelector<HTMLElement>('.media-grid-virtual') as HTMLElement;
const tile = (index: number) => scrollBox().querySelector<HTMLElement>(`[data-media-index="${index}"]`);
const previewDialog = () => document.querySelector('dialog.dockspace-dialog--viewer-fullscreen');
const shownPath = () => screen.getByTestId('preview-content').textContent;

/** Opens the preview from a tile the way a keyboard user does: the tile has focus, Enter clicks it. */
const openWithKeyboard = (name: string) => {
  const button = screen.getByRole('button', { name: `Open ${name}` });
  button.focus();
  fireEvent.click(button);
  expect(previewDialog()).not.toBeNull();
};

/** Clicks a preview control: like a browser, the press moves focus to it first. */
const pressPreviewButton = (name: string) => {
  const button = screen.getByRole('button', { name });
  button.focus();
  fireEvent.click(button);
};

/**
 * A mouse press like the browser's: unless the handler prevents the default, a press on an element that cannot take
 * focus blurs the focused element, so focus falls to <body> (jsdom does not do this on its own).
 */
const pressMouseOn = (element: Element) => {
  const notPrevented = fireEvent.mouseDown(element);
  if (notPrevented && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
};

const scrollGridTo = (scrollTop: number) => {
  act(() => {
    fireEvent.scroll(scrollBox(), { target: { scrollTop } });
  });
};

describe('Gallery preview focus return', () => {
  beforeEach(() => {
    setMediaItems(mockState.buildMediaItems(200));
    mockState.albumItems = [];
    mockState.albumsData = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('returns focus to the opening tile when the preview closes with Escape', () => {
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    openWithKeyboard('item-0005.jpg');
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(previewDialog()).toBeNull();
    expect(document.activeElement).toBe(tile(5));
  });

  it('returns focus to the opening tile with Escape after focus left it while the preview was open', () => {
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    openWithKeyboard('item-0007.jpg');
    // For example, a press on the shown image (which cannot take focus) moves focus to <body>.
    pressMouseOn(screen.getByTestId('preview-content'));
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(previewDialog()).toBeNull();
    expect(document.activeElement).toBe(tile(7));
  });

  it('returns focus to the opening tile when the close button is pressed', () => {
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    openWithKeyboard('item-0002.jpg');
    pressPreviewButton('Close preview');

    expect(previewDialog()).toBeNull();
    expect(document.activeElement).toBe(tile(2));
  });

  it('returns focus to the opening tile after a click on the backdrop', () => {
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    openWithKeyboard('item-0003.jpg');
    const backdrop = document.querySelector('.dockspace-dialog-backdrop--viewer') as HTMLElement;
    pressMouseOn(backdrop);

    expect(previewDialog()).toBeNull();
    expect(document.activeElement).toBe(tile(3));
  });

  it('returns focus to the opening tile after a click on the empty area around the media', () => {
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    openWithKeyboard('item-0004.jpg');
    pressMouseOn(previewDialog() as HTMLElement);

    expect(previewDialog()).toBeNull();
    expect(document.activeElement).toBe(tile(4));
  });

  it('returns focus to the tile of the item shown last after Next and Previous buttons', () => {
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    openWithKeyboard('item-0001.jpg');
    pressPreviewButton('Next media item');
    pressPreviewButton('Next media item');
    pressPreviewButton('Next media item');
    pressPreviewButton('Previous media item');
    expect(shownPath()).toBe('/photos/item-0003.jpg');

    pressPreviewButton('Close preview');

    expect(previewDialog()).toBeNull();
    expect(document.activeElement).toBe(tile(3));
  });

  it('returns focus to the tile of the item shown last after the arrow keys', () => {
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    openWithKeyboard('item-0010.jpg');
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(shownPath()).toBe('/photos/item-0011.jpg');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(document.activeElement).toBe(tile(11));
  });

  it('scrolls the tile of the item shown last into view and focuses it when it is past the rendered rows', () => {
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    // Tile 23 ends the rendered rows; Next twice shows item 25 (row 6), which is not rendered.
    openWithKeyboard('item-0023.jpg');
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(tile(25)).toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(document.activeElement).toBe(tile(25));
    // Row 6 in the middle of the box: 6 * 200 - (600 - 200) / 2.
    expect(scrollBox().scrollTop).toBe(6 * ROW_STRIDE_PX - (BOX_HEIGHT - ROW_HEIGHT_PX) / 2);
  });

  it('scrolls back to the opening tile when the grid was scrolled away while the preview was open', () => {
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    openWithKeyboard('item-0001.jpg');
    scrollGridTo(30 * ROW_STRIDE_PX);
    expect(tile(1)).toBeNull();

    pressPreviewButton('Close preview');

    expect(previewDialog()).toBeNull();
    expect(scrollBox().scrollTop).toBe(0);
    expect(document.activeElement).toBe(tile(1));
  });

  it('moves focus to the scroll box when the item shown last is no longer in the grid', () => {
    const { rerender } = render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    openWithKeyboard('item-0006.jpg');
    // A refetch while the preview is open drops the item (for example, it was trashed elsewhere).
    setMediaItems((mockState.mediaData.pages[0]?.items ?? []).filter((item) => item.fileNodeId !== 'file-0006'));
    rerender(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(previewDialog()).toBeNull();
    expect(document.activeElement).toBe(scrollBox());
  });

  it('moves focus to the Select multiple toggle when no grid is rendered', () => {
    const { rerender } = render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    openWithKeyboard('item-0000.jpg');
    setMediaItems([]);
    rerender(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
    expect(document.querySelector('.media-grid-virtual')).toBeNull();

    pressPreviewButton('Close preview');

    expect(previewDialog()).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Select multiple' }));
  });

  describe('on phone', () => {
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
      window.matchMedia = vi.fn((query: string) => ({
        matches: query.includes('max-width: 900px'),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    it('returns focus to the opening tile when the close button is pressed', () => {
      render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
      expect(screen.queryByRole('button', { name: 'Select multiple' })).toBeNull();

      openWithKeyboard('item-0002.jpg');
      pressPreviewButton('Close preview');

      expect(previewDialog()).toBeNull();
      expect(document.activeElement).toBe(tile(2));
    });

    it('moves focus to the album button when no grid is rendered', () => {
      const { rerender } = render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

      openWithKeyboard('item-0000.jpg');
      setMediaItems([]);
      rerender(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
      expect(document.querySelector('.media-grid-virtual')).toBeNull();

      pressPreviewButton('Close preview');

      expect(previewDialog()).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Album: All media' }));
    });
  });

  it('returns focus to the tile in an album view', () => {
    mockState.albumsData = [{ albumId: 'album-1', name: 'Travel' }];
    mockState.albumItems = mockState.buildMediaItems(60).slice(30);
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    fireEvent.click(screen.getByRole('button', { name: 'Album: All media' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Travel' }));
    expect(screen.getByRole('button', { name: 'Album: Travel' })).toBeInTheDocument();

    openWithKeyboard('item-0032.jpg');
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(previewDialog()).toBeNull();
    // Album position 3 (item-0033).
    expect(document.activeElement).toBe(tile(3));
    expect(tile(3)).toHaveAccessibleName('Open item-0033.jpg');
  });

  it('keeps multi-select working after a preview was closed', () => {
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    openWithKeyboard('item-0001.jpg');
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: 'Select multiple' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select item-0001.jpg' }));

    expect(screen.getByText('1 item selected')).toBeInTheDocument();
    expect(previewDialog()).toBeNull();
  });
});
