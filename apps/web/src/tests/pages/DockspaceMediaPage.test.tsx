import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DockspaceMediaPage } from '@/pages/DockspaceMediaPage';
import type { MediaFileRecord } from '@/lib/apiTypes';
import type { ActiveUploadFile, SkippedUploadFile } from '@/hooks/useDockspaceUploadDialog';

const mockState = vi.hoisted(() => ({
  buildMediaItems: (count: number): MediaFileRecord[] =>
    Array.from({ length: count }, (_, index) => {
      const itemNumber = String(index + 1).padStart(4, '0');
      return {
        fileNodeId: `file-${itemNumber}`,
        fullPath: `/photos/item-${itemNumber}.jpg`,
        size: 1_024 + index,
        contentType: 'image/jpeg',
        contentHash: `hash-${itemNumber}`,
        updatedAt: `2026-02-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
        state: 'ACTIVE'
      };
    }),
  mediaData: {
    pages: [
      {
        items: [] as MediaFileRecord[]
      }
    ]
  },
  mediaHasNextPage: false,
  mediaIsFetchingNextPage: false,
  mediaIsLoading: false,
  mediaError: null as unknown,
  mediaFetchNextPage: vi.fn(async () => {}),
  mediaDuplicatesData: {
    pages: []
  },
  albumsData: [] as Array<{ albumId: string; name: string; mediaCount?: number }>,
  uploadFile: vi.fn(async () => ({})),
  moveToTrash: vi.fn(async () => ({})),
  trashFilesBatch: vi.fn(async () => ({ movedPaths: [], failed: [] })),
  assignAlbumMedia: vi.fn(async () => ({})),
  isPhone: false,
  activeUploads: [] as ActiveUploadFile[],
  skippedUploads: [] as SkippedUploadFile[],
  retryUpload: vi.fn(),
  clearSkippedUploads: vi.fn(),
  stageFiles: vi.fn()
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...props }: { children?: unknown; to?: string; params?: unknown }) => (
    <a href={to} {...props}>
      {children as any}
    </a>
  )
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/auth/UnauthorizedNotice', () => ({
  UnauthorizedNotice: () => <div>UnauthorizedNotice</div>
}));

vi.mock('@/components/files/FileViewerDialog', () => ({
  FileViewerDialog: ({ isOpen, file }: { isOpen: boolean; file: { fullPath?: string } | null }) =>
    isOpen ? <div>{`FileViewerDialog:${file?.fullPath ?? 'none'}`}</div> : null
}));

vi.mock('@/components/files/FilePreviewContent', () => ({
  FilePreviewContent: () => <div>FilePreviewContent</div>
}));

vi.mock('@/components/files/UploadStagingList', () => ({
  UploadStagingList: () => <div>UploadStagingList</div>
}));

vi.mock('@/hooks/useDockspaceUploadDialog', () => ({
  useDockspaceUploadDialog: () => ({
    clearValidationError: vi.fn(),
    validationError: null,
    stageFiles: mockState.stageFiles,
    activeUploads: mockState.activeUploads,
    retryUpload: mockState.retryUpload,
    skippedUploads: mockState.skippedUploads,
    clearSkippedUploads: mockState.clearSkippedUploads,
    isPreparingFolders: false
  })
}));

vi.mock('@/hooks/useFiles', () => ({
  useUploadFile: () => ({ mutateAsync: mockState.uploadFile, isPending: false, error: null }),
  useMoveToTrash: () => ({ mutateAsync: mockState.moveToTrash, isPending: false, error: null }),
  useTrashFilesBatch: () => ({
    mutateAsync: mockState.trashFilesBatch,
    isPending: false,
    error: null
  })
}));

vi.mock('@/hooks/useMedia', () => ({
  useMediaFiles: () => ({
    data: mockState.mediaData,
    hasNextPage: mockState.mediaHasNextPage,
    isFetchingNextPage: mockState.mediaIsFetchingNextPage,
    isLoading: mockState.mediaIsLoading,
    error: mockState.mediaError,
    fetchNextPage: mockState.mediaFetchNextPage
  }),
  useMediaDuplicates: () => ({
    data: mockState.mediaDuplicatesData,
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    error: null,
    fetchNextPage: vi.fn()
  }),
  useAlbums: () => ({ data: mockState.albumsData, isLoading: false, error: null }),
  useAlbumMedia: () => ({ data: [], isLoading: false, error: null }),
  useMediaAlbums: () => ({ data: [], isLoading: false, error: null }),
  useCreateAlbum: () => ({
    mutateAsync: vi.fn(async (name: string) => ({ albumId: 'album-1', name })),
    isPending: false
  }),
  useRenameAlbum: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
  useDeleteAlbum: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false }),
  useAssignAlbumMedia: () => ({ mutateAsync: mockState.assignAlbumMedia, isPending: false }),
  useRemoveAlbumMedia: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false })
}));

beforeEach(() => {
  mockState.mediaData = {
    pages: [
      {
        items: mockState.buildMediaItems(0)
      }
    ]
  };
  mockState.albumsData = [];
  mockState.mediaHasNextPage = false;
  mockState.mediaIsFetchingNextPage = false;
  mockState.mediaIsLoading = false;
  mockState.mediaError = null;
  mockState.mediaFetchNextPage.mockClear();
  mockState.trashFilesBatch.mockClear();
  mockState.assignAlbumMedia.mockClear();
  mockState.isPhone = false;
  mockState.activeUploads = [];
  mockState.skippedUploads = [];
  mockState.retryUpload.mockClear();
  mockState.clearSkippedUploads.mockClear();
  mockState.stageFiles.mockClear();
  window.matchMedia = vi.fn((query: string) => ({
    matches: mockState.isPhone && query.includes('max-width: 900px'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  })) as unknown as typeof window.matchMedia;
});

describe('DockspaceMediaPage', () => {
  afterEach(() => {
    cleanup();
  });

  it('virtualizes all-media grid by rendering only visible subset', () => {
    mockState.mediaData = {
      pages: [
        {
          items: mockState.buildMediaItems(120)
        }
      ]
    };

    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    expect(screen.queryByText('item-0001.jpg')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.media-card').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.media-card').length).toBeLessThan(120);
    expect(screen.getByRole('button', { name: 'Show small thumbnails' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show medium thumbnails' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show large thumbnails' })).toBeInTheDocument();
    expect(screen.queryByText('Filter by album')).not.toBeInTheDocument();
  });

  it('fetches the next page when scrolling near the bottom', async () => {
    mockState.mediaData = {
      pages: [
        {
          items: mockState.buildMediaItems(80)
        }
      ]
    };
    mockState.mediaHasNextPage = true;

    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    const virtualScroller = document.querySelector('.media-grid-virtual');
    expect(virtualScroller).not.toBeNull();
    fireEvent.scroll(virtualScroller as Element, { target: { scrollTop: 100_000 } });

    await waitFor(() => {
      expect(mockState.mediaFetchNextPage).toHaveBeenCalledTimes(1);
    });
  });

  it('updates grid size class when selecting another gallery size', () => {
    mockState.mediaData = {
      pages: [
        {
          items: mockState.buildMediaItems(24)
        }
      ]
    };

    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    expect(document.querySelector('.media-grid--virtual.media-grid--medium')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show large thumbnails' }));
    expect(document.querySelector('.media-grid--virtual.media-grid--large')).not.toBeNull();
  });

  it('opens fullscreen preview when clicking an item', () => {
    mockState.mediaData = {
      pages: [
        {
          items: mockState.buildMediaItems(8)
        }
      ]
    };

    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    fireEvent.click(screen.getByRole('button', { name: 'Open item-0001.jpg' }));

    expect(screen.getByText('FileViewerDialog:/photos/item-0001.jpg')).toBeInTheDocument();
  });

  it('replaces default actions with multi-selection actions and can trash selected media', async () => {
    mockState.mediaData = {
      pages: [
        {
          items: mockState.buildMediaItems(8)
        }
      ]
    };
    mockState.albumsData = [{ albumId: 'album-1', name: 'Travel' }];

    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    fireEvent.click(screen.getByRole('button', { name: 'Select multiple' }));
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trash selected' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to album' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Select item-0001.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select item-0002.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trash selected' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));

    await waitFor(() => {
      expect(mockState.trashFilesBatch).toHaveBeenCalledWith([
        '/photos/item-0001.jpg',
        '/photos/item-0002.jpg'
      ]);
    });
  });

  it('selects the full range when shift-clicking in multi-select mode', async () => {
    mockState.mediaData = {
      pages: [
        {
          items: mockState.buildMediaItems(8)
        }
      ]
    };

    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    fireEvent.click(screen.getByRole('button', { name: 'Select multiple' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select item-0001.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select item-0003.jpg' }), {
      shiftKey: true
    });
    fireEvent.click(screen.getByRole('button', { name: 'Trash selected' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));

    await waitFor(() => {
      expect(mockState.trashFilesBatch).toHaveBeenCalledWith([
        '/photos/item-0001.jpg',
        '/photos/item-0002.jpg',
        '/photos/item-0003.jpg'
      ]);
    });
  });

  it('adds multi-selected media to the chosen album', async () => {
    mockState.mediaData = {
      pages: [
        {
          items: mockState.buildMediaItems(8)
        }
      ]
    };
    mockState.albumsData = [{ albumId: 'album-1', name: 'Travel' }];

    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    fireEvent.click(screen.getByRole('button', { name: 'Select multiple' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select item-0001.jpg' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to album' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Album' }), {
      target: { value: 'album-1' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add selected items' }));

    await waitFor(() => {
      expect(mockState.assignAlbumMedia).toHaveBeenCalledWith({
        albumId: 'album-1',
        fileNodeIds: ['file-0001']
      });
    });
  });
});

const withItems = (count = 8) => {
  mockState.mediaData = { pages: [{ items: mockState.buildMediaItems(count) }] };
};

const renderPage = () => render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

const upload = (id: number, fullPath: string, status: ActiveUploadFile['status'], progress = 0): ActiveUploadFile => ({
  id,
  file: new File(['x'], fullPath.split('/').pop() ?? 'x'),
  sourcePath: fullPath,
  destinationPath: fullPath,
  folderPath: '/',
  fullPath,
  status,
  progress
});

describe('DockspaceMediaPage layout (no sidebar, album menu, gallery options)', () => {
  beforeEach(() => {
    withItems();
    mockState.albumsData = [
      { albumId: 'album-1', name: 'Travel', mediaCount: 3 },
      { albumId: 'album-2', name: 'Pets', mediaCount: 1 }
    ];
  });

  afterEach(() => {
    cleanup();
  });

  it('has no sidebar and no card frame wrapper', () => {
    renderPage();

    expect(screen.queryByRole('complementary', { name: 'Media sidebar' })).not.toBeInTheDocument();
    expect(document.querySelector('.dockspace-page-shell')).toBeNull();
    expect(document.querySelector('.dockspace-sidebar')).toBeNull();
    expect(screen.queryByText('No active uploads.')).not.toBeInTheDocument();
  });

  it('desktop: the album menu lists All media and every album, marks the current one and switches on click', () => {
    renderPage();

    const trigger = screen.getByRole('button', { name: 'Album: All media' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);

    const menu = screen.getByRole('menu', { name: 'Albums' });
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items.map((item) => item.getAttribute('aria-label') ?? item.textContent)).toEqual([
      'All media',
      'Travel, 3 items',
      'Pets, 1 item'
    ]);
    expect(within(menu).getByRole('menuitemradio', { name: 'All media' })).toHaveAttribute('aria-checked', 'true');
    expect(within(menu).getByRole('menuitemradio', { name: 'All media' })).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Travel, 3 items' }));

    expect(screen.queryByRole('menu', { name: 'Albums' })).not.toBeInTheDocument();
    const albumTrigger = screen.getByRole('button', { name: 'Album: Travel, 3 items' });
    expect(albumTrigger).toHaveFocus();

    fireEvent.click(albumTrigger);
    expect(screen.getByRole('menuitemradio', { name: 'Travel, 3 items' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'All media' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menuitemradio', { name: 'Travel, 3 items' })).toHaveFocus();

    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Albums' })).not.toBeInTheDocument();
    expect(albumTrigger).toHaveFocus();
  });

  it('desktop: the album menu holds All media only when there are no albums', () => {
    mockState.albumsData = [];
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Album: All media' }));
    const menu = screen.getByRole('menu', { name: 'Albums' });
    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(1);
    expect(within(menu).queryByRole('separator')).not.toBeInTheDocument();
  });

  it('phone: the album button opens a full-screen list that switches and closes with focus back on the button', () => {
    mockState.isPhone = true;
    renderPage();

    const trigger = screen.getByRole('button', { name: 'Album: All media' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Albums' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const nav = within(dialog).getByRole('navigation', { name: 'Albums' });
    const current = within(nav).getByRole('button', { name: 'All media' });
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(current).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(within(nav).getByRole('button', { name: 'Pets, 1 item' }));

    expect(screen.queryByRole('dialog', { name: 'Albums' })).not.toBeInTheDocument();
    const albumButton = screen.getByRole('button', { name: 'Album: Pets, 1 item' });
    expect(albumButton).toHaveFocus();

    fireEvent.click(albumButton);
    expect(screen.getByRole('button', { name: 'Pets, 1 item' })).toHaveAttribute('aria-current', 'true');
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Albums' })).not.toBeInTheDocument();
    expect(albumButton).toHaveFocus();

    fireEvent.click(albumButton);
    fireEvent.click(screen.getByRole('button', { name: 'Close albums' }));
    expect(screen.queryByRole('dialog', { name: 'Albums' })).not.toBeInTheDocument();
    expect(albumButton).toHaveFocus();
  });

  it('phone: Tab stays inside the album list while it is open', () => {
    mockState.isPhone = true;
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Album: All media' }));
    const dialog = screen.getByRole('dialog', { name: 'Albums' });
    const last = within(dialog).getByRole('button', { name: 'Pets, 1 item' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(within(dialog).getByRole('button', { name: 'Close albums' })).toHaveFocus();
  });

  it('Gallery options: Find duplicates opens the duplicates view, then reads Browse media; focus stays on the ⋯ button', () => {
    renderPage();

    const options = screen.getByRole('button', { name: 'Gallery options' });
    fireEvent.click(options);
    const menu = screen.getByRole('menu', { name: 'Gallery options' });
    expect(within(menu).queryByRole('menuitem', { name: 'Select items' })).not.toBeInTheDocument();
    expect(within(menu).getByText('Trash').closest('a')).toHaveAttribute('href', '/dockspaces/$dockspaceId/trash');
    expect(within(menu).getByText('Detailed usage').closest('a')).toHaveAttribute(
      'href',
      '/dockspaces/$dockspaceId/usage'
    );
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Find duplicates' }));

    expect(screen.getByText('0 duplicate groups found.')).toBeInTheDocument();
    expect(options).toHaveFocus();

    fireEvent.click(options);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Browse media' }));
    expect(screen.queryByText('0 duplicate groups found.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open item-0001.jpg' })).toBeInTheDocument();
    expect(options).toHaveFocus();
  });

  it('Gallery options: in an album Find duplicates is disabled with a hint, and a click keeps the menu open', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Album: All media' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Travel, 3 items' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gallery options' }));

    const findDuplicates = screen.getByRole('menuitem', { name: /Find duplicates/ });
    expect(findDuplicates).toHaveAttribute('aria-disabled', 'true');
    expect(findDuplicates).toHaveTextContent('All media only');
    fireEvent.click(findDuplicates);
    expect(screen.getByRole('menu', { name: 'Gallery options' })).toBeInTheDocument();
    expect(screen.queryByText('0 duplicate groups found.')).not.toBeInTheDocument();
  });

  it('desktop: the toolbar has Select multiple, the size toggle, Upload and ⋯', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Select multiple' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Gallery thumbnail size' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gallery options' })).toBeInTheDocument();
  });

  it('desktop: Cancel in the selection bar returns focus to the album button', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Select multiple' }));
    expect(screen.queryByRole('button', { name: /^Album:/ })).not.toBeInTheDocument();
    expect(screen.getByText('0 items selected')).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.focus();
    fireEvent.click(cancel);

    expect(screen.getByRole('button', { name: 'Album: All media' })).toHaveFocus();
  });

  it('phone: Select items in ⋯ starts selection, the bar replaces the toolbar, and Cancel ends it', () => {
    mockState.isPhone = true;
    renderPage();

    expect(screen.queryByRole('button', { name: 'Select multiple' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gallery options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Select items' }));

    expect(screen.queryByRole('button', { name: /^Album:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gallery options' })).not.toBeInTheDocument();
    expect(screen.getByText('0 items selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to album' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trash selected' })).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Select item-0002.jpg' }));
    expect(screen.getByText('1 item selected')).toBeInTheDocument();

    fireEvent.click(cancel);
    expect(screen.getByRole('button', { name: 'Album: All media' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Open item-0002.jpg' })).toBeInTheDocument();
  });

  it.each([false, true])('Upload opens the media file picker (phone: %s)', (isPhone) => {
    mockState.isPhone = isPhone;
    renderPage();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    const uploadButton = screen.getByRole('button', { name: 'Upload' });
    expect(uploadButton.closest('.media-workspace__floating')).toEqual(
      isPhone ? expect.any(HTMLElement) : null
    );
    fireEvent.click(uploadButton);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('shows active uploads in the floating uploads card with Retry', () => {
    mockState.activeUploads = [
      upload(1, '/IMG_1.jpg', 'uploading', 40),
      upload(2, '/IMG_2.jpg', 'failed')
    ];
    renderPage();

    const card = screen.getByRole('region', { name: 'Uploads' });
    expect(card.closest('.media-workspace__floating')).not.toBeNull();
    expect(within(card).getByText('2 active')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Retry' }));
    expect(mockState.retryUpload).toHaveBeenCalledWith(2);
  });

  it('phone: the uploads card starts as a pill', () => {
    mockState.isPhone = true;
    mockState.activeUploads = [upload(1, '/IMG_1.jpg', 'uploading', 40)];
    renderPage();

    expect(screen.getByRole('button', { name: /^Expand uploads: Uploading 1 of 1/ })).toBeInTheDocument();
  });

  it('Dismiss on skipped duplicates clears them and moves focus to the Upload button', () => {
    mockState.skippedUploads = [{ fullPath: '/IMG_9.jpg', duplicateType: 'CONTENT_HASH', reason: 'Duplicate' }];
    const { rerender } = renderPage();

    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    dismiss.focus();
    fireEvent.click(dismiss);
    expect(mockState.clearSkippedUploads).toHaveBeenCalledTimes(1);
    mockState.skippedUploads = [];
    rerender(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    expect(screen.queryByRole('region', { name: 'Uploads' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toHaveFocus();
  });

  it('shows skipped non-media files in the uploads card instead of a page alert', () => {
    renderPage();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    act(() => {
      fireEvent.change(input, {
        target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] }
      });
    });

    const card = screen.getByRole('region', { name: 'Uploads' });
    expect(within(card).getByText(/1 file were skipped/)).toBeInTheDocument();
    expect(document.querySelector('.media-workspace__alerts')).toBeNull();
  });
});
