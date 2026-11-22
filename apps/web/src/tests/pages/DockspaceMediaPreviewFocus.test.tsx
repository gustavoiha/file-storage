import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  albumsData: [] as Array<{ albumId: string; name: string }>,
  // When true, the preview shows a video with native controls (which take Tab) instead of an image.
  previewIsVideo: false,
  // The one item whose preview holds a focusable control: a video with controls, or the "Open file in a new tab"
  // link of a file too large to preview. Other items show only the (unfocusable) image.
  focusableContentFor: null as { fullPath: string; control: 'video' | 'link' } | null,
  // Extra elements that use the arrow keys themselves (media controls, form fields), shown with every item.
  arrowKeyOwners: false
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/files/FilePreviewContent', () => ({
  FilePreviewContent: ({ file }: { file: { fullPath: string } | null }) => (
    <div data-testid="preview-content">
      {file?.fullPath ?? ''}
      {mockState.previewIsVideo ? <video data-testid="preview-video" controls /> : null}
      {mockState.focusableContentFor?.fullPath === file?.fullPath ? (
        mockState.focusableContentFor?.control === 'video' ? (
          // jsdom cannot focus a <video> on its own; browsers can, through its controls.
          <video data-testid="preview-focusable-video" controls tabIndex={0} />
        ) : (
          <a href="https://files.example.test/item" target="_blank" rel="noreferrer">
            Open file in a new tab
          </a>
        )
      ) : null}
      {mockState.arrowKeyOwners ? (
        <>
          <video data-testid="owner-video" controls tabIndex={0}>
            <track data-testid="owner-video-track" kind="captions" />
          </video>
          <audio data-testid="owner-audio" controls tabIndex={0} />
          <input data-testid="owner-input" aria-label="Field" />
          <textarea data-testid="owner-textarea" aria-label="Notes" />
          <select data-testid="owner-select" aria-label="Choice">
            {/* No option text: the tests read the shown path from the preview's text. */}
            <option value="one" aria-label="One" />
          </select>
          <iframe data-testid="owner-iframe" title="Embedded file" />
        </>
      ) : null}
    </div>
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
  useRemoveAlbumMedia: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRefreshMediaAfterUploads: () => () => undefined
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

/** A click that leaves focus where it was, like Safari's click on a button. */
const clickWithoutFocus = (element: Element) => {
  fireEvent.click(element);
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
    mockState.previewIsVideo = false;
    mockState.focusableContentFor = null;
    mockState.arrowKeyOwners = false;
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

describe('Gallery preview focus on open and Tab trap', () => {
  /**
   * Blur the focused element whenever it gains `disabled`, as the browser does. jsdom ignores blur() on a disabled
   * element, so enable it for the blur.
   */
  let blurOnDisable: MutationObserver | undefined;

  beforeEach(() => {
    setMediaItems(mockState.buildMediaItems(200));
    mockState.albumItems = [];
    mockState.albumsData = [];
    mockState.previewIsVideo = false;
    mockState.focusableContentFor = null;
    mockState.arrowKeyOwners = false;
    blurOnDisable = new MutationObserver(() => {
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement && active.disabled) {
        active.disabled = false;
        active.blur();
        active.disabled = true;
      }
    });
    blurOnDisable.observe(document.body, { attributes: true, attributeFilter: ['disabled'], subtree: true });
  });

  afterEach(() => {
    blurOnDisable?.disconnect();
    cleanup();
  });

  const closeButton = () => screen.getByRole('button', { name: 'Close preview' });
  const previousButton = () => screen.getByRole('button', { name: 'Previous media item' });
  const nextButton = () => screen.getByRole('button', { name: 'Next media item' });

  it('moves focus to Close preview when the preview opens from the keyboard, inside the named dialog', () => {
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    openWithKeyboard('item-0005.jpg');

    const dialog = screen.getByRole('dialog', { name: 'Preview item-0005.jpg' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.activeElement).toBe(closeButton());
    expect(within(dialog).getByRole('button', { name: 'Close preview' })).toBe(document.activeElement);
  });

  it('moves focus to Close preview when the preview opens from a click', async () => {
    const user = userEvent.setup();
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    await user.click(screen.getByRole('button', { name: 'Open item-0008.jpg' }));

    expect(previewDialog()).not.toBeNull();
    expect(document.activeElement).toBe(closeButton());
  });

  it('keeps Tab and Shift+Tab on the preview controls', async () => {
    const user = userEvent.setup();
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
    openWithKeyboard('item-0005.jpg');

    await user.tab();
    expect(document.activeElement).toBe(previousButton());
    await user.tab();
    expect(document.activeElement).toBe(nextButton());
    await user.tab();
    expect(document.activeElement).toBe(closeButton());

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(nextButton());
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(previousButton());
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(closeButton());
  });

  it('lets Tab and Shift+Tab move on from the video controls instead of jumping to the ends', () => {
    // jsdom cannot focus a <video> (browsers can, through its controls) and user-event skips it, so the video is
    // reported as the focused element and the keys are sent directly. The trap must leave a Tab from the video to
    // the browser (on to Next), not treat the video as outside the dialog and jump to Close.
    mockState.previewIsVideo = true;
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
    openWithKeyboard('item-0005.jpg');
    const video = screen.getByTestId('preview-video');
    const activeElement = vi.spyOn(document, 'activeElement', 'get').mockReturnValue(video);
    try {
      expect(fireEvent.keyDown(video, { key: 'Tab' })).toBe(true);
      expect(fireEvent.keyDown(video, { key: 'Tab', shiftKey: true })).toBe(true);
    } finally {
      activeElement.mockRestore();
    }
    expect(document.activeElement).toBe(closeButton());

    // Next is still the last control: Tab from it wraps to Close.
    nextButton().focus();
    expect(fireEvent.keyDown(nextButton(), { key: 'Tab' })).toBe(false);
    expect(document.activeElement).toBe(closeButton());
  });

  it('skips the disabled Previous button on the first item', async () => {
    const user = userEvent.setup();
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
    openWithKeyboard('item-0000.jpg');
    expect(previousButton()).toBeDisabled();

    await user.tab();
    expect(document.activeElement).toBe(nextButton());
    await user.tab();
    expect(document.activeElement).toBe(closeButton());
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(nextButton());
  });

  it('brings Tab and Shift+Tab from <body> back into the preview', async () => {
    const user = userEvent.setup();
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
    openWithKeyboard('item-0005.jpg');

    // A press on the shown image (which cannot take focus) moves focus to <body>.
    pressMouseOn(screen.getByTestId('preview-content'));
    expect(document.activeElement).toBe(document.body);
    await user.tab();
    expect(document.activeElement).toBe(closeButton());

    pressMouseOn(screen.getByTestId('preview-content'));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(nextButton());
  });

  it('moves focus to Previous when Next is disabled while it has focus', async () => {
    setMediaItems(mockState.buildMediaItems(10));
    const user = userEvent.setup();
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
    openWithKeyboard('item-0008.jpg');

    await user.click(nextButton());
    expect(shownPath()).toBe('/photos/item-0009.jpg');
    expect(nextButton()).toBeDisabled();
    expect(document.activeElement).toBe(previousButton());

    await user.tab();
    expect(document.activeElement).toBe(closeButton());
  });

  it('moves focus to Next when Previous is disabled while it has focus (arrow key)', async () => {
    const user = userEvent.setup();
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
    openWithKeyboard('item-0001.jpg');

    await user.tab();
    expect(document.activeElement).toBe(previousButton());
    await user.keyboard('{ArrowLeft}');
    expect(shownPath()).toBe('/photos/item-0000.jpg');
    expect(previousButton()).toBeDisabled();
    expect(document.activeElement).toBe(nextButton());
  });

  it('leaves focus on Close when navigation disables a button that did not have focus', async () => {
    const user = userEvent.setup();
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
    openWithKeyboard('item-0001.jpg');

    await user.keyboard('{ArrowLeft}');
    expect(previousButton()).toBeDisabled();
    expect(document.activeElement).toBe(closeButton());
  });

  it('moves focus to Close preview when the item changes while focus is on the video controls', () => {
    mockState.focusableContentFor = { fullPath: '/photos/item-0005.jpg', control: 'video' };
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
    openWithKeyboard('item-0005.jpg');

    const video = screen.getByTestId('preview-focusable-video');
    video.focus();
    expect(document.activeElement).toBe(video);

    // Arrow keys from the video seek it, so the item changes by a click on Next that leaves focus on the video
    // (Safari does not focus a button on click).
    clickWithoutFocus(nextButton());

    expect(shownPath()).toBe('/photos/item-0006.jpg');
    expect(video.isConnected).toBe(false);
    expect(document.activeElement).toBe(closeButton());
  });

  it('moves focus to Close preview when the item changes while focus is on the "Open file in a new tab" link', async () => {
    mockState.focusableContentFor = { fullPath: '/photos/item-0005.jpg', control: 'link' };
    const user = userEvent.setup();
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
    openWithKeyboard('item-0005.jpg');

    // Close, Previous, then the link inside the preview content.
    await user.tab();
    await user.tab();
    const link = screen.getByRole('link', { name: 'Open file in a new tab' });
    expect(document.activeElement).toBe(link);

    await user.keyboard('{ArrowLeft}');

    expect(shownPath()).toBe('/photos/item-0004.jpg');
    expect(link.isConnected).toBe(false);
    expect(document.activeElement).toBe(closeButton());

    // Tab goes on from Close as before.
    await user.tab();
    expect(document.activeElement).toBe(previousButton());
  });

  it('moves focus to Close preview, not the other nav button, when the item changes from the video to the last item', () => {
    setMediaItems(mockState.buildMediaItems(10));
    mockState.focusableContentFor = { fullPath: '/photos/item-0008.jpg', control: 'video' };
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
    openWithKeyboard('item-0008.jpg');

    const video = screen.getByTestId('preview-focusable-video');
    video.focus();
    clickWithoutFocus(nextButton());
    expect(video.isConnected).toBe(false);

    expect(shownPath()).toBe('/photos/item-0009.jpg');
    expect(nextButton()).toBeDisabled();
    expect(document.activeElement).toBe(closeButton());
  });

  it('keeps the focus return to the tile of the item shown last after tabbing inside the preview', async () => {
    const user = userEvent.setup();
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
    openWithKeyboard('item-0004.jpg');

    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(nextButton());
    await user.keyboard('{Enter}');
    expect(shownPath()).toBe('/photos/item-0005.jpg');
    await user.keyboard('{Escape}');

    expect(previewDialog()).toBeNull();
    expect(document.activeElement).toBe(tile(5));
  });
});

describe('Gallery preview arrow keys', () => {
  beforeEach(() => {
    setMediaItems(mockState.buildMediaItems(200));
    mockState.albumItems = [];
    mockState.albumsData = [];
    mockState.previewIsVideo = false;
    mockState.focusableContentFor = null;
    mockState.arrowKeyOwners = true;
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    ['the video controls', 'owner-video'],
    ['an element inside the video', 'owner-video-track'],
    ['the audio controls', 'owner-audio'],
    ['a text field', 'owner-input'],
    ['a text area', 'owner-textarea'],
    ['a select', 'owner-select'],
    ['an embedded frame', 'owner-iframe']
  ])('leaves ArrowLeft and ArrowRight from %s to the browser and keeps the shown item', (_label, testId) => {
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
    openWithKeyboard('item-0005.jpg');

    const owner = screen.getByTestId(testId);
    owner.focus();
    const focusedBefore = document.activeElement;

    // fireEvent returns false when a handler called preventDefault(), which would stop the native seek.
    expect(fireEvent.keyDown(owner, { key: 'ArrowRight' })).toBe(true);
    expect(fireEvent.keyDown(owner, { key: 'ArrowLeft' })).toBe(true);
    expect(fireEvent.keyDown(owner, { key: 'ArrowRight' })).toBe(true);

    expect(shownPath()).toBe('/photos/item-0005.jpg');
    expect(document.activeElement).toBe(focusedBefore);
  });

  it('still closes the preview with Escape from the video controls', () => {
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
    openWithKeyboard('item-0005.jpg');

    const video = screen.getByTestId('owner-video');
    video.focus();
    expect(fireEvent.keyDown(video, { key: 'Escape' })).toBe(false);

    expect(previewDialog()).toBeNull();
    expect(document.activeElement).toBe(tile(5));
  });

  it.each([
    ['Close preview', () => screen.getByRole('button', { name: 'Close preview' })],
    ['Previous', () => screen.getByRole('button', { name: 'Previous media item' })],
    ['Next', () => screen.getByRole('button', { name: 'Next media item' })],
    ['nothing in particular', () => document.body]
  ])('changes the item with ArrowLeft and ArrowRight when focus is on %s', (_label, getTarget) => {
    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);
    openWithKeyboard('item-0005.jpg');

    const target = getTarget();
    if (target === document.body) {
      pressMouseOn(screen.getByTestId('preview-content'));
    } else {
      target.focus();
    }
    expect(document.activeElement).toBe(target);

    expect(fireEvent.keyDown(target, { key: 'ArrowRight' })).toBe(false);
    expect(shownPath()).toBe('/photos/item-0006.jpg');
    expect(fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowRight' })).toBe(false);
    expect(shownPath()).toBe('/photos/item-0007.jpg');
    expect(fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowLeft' })).toBe(false);
    expect(shownPath()).toBe('/photos/item-0006.jpg');
  });
});
