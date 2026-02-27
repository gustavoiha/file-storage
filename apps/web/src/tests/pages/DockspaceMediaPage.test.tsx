import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DockspaceMediaPage } from '@/pages/DockspaceMediaPage';
import type { MediaFileRecord } from '@/lib/apiTypes';

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
  assignAlbumMedia: vi.fn(async () => ({}))
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
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
    stageFiles: vi.fn(),
    activeUploads: [],
    retryUpload: vi.fn(),
    skippedUploads: [],
    clearSkippedUploads: vi.fn()
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

describe('DockspaceMediaPage', () => {
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
  });

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

  it('switches to an album from the sidebar list', () => {
    mockState.mediaData = {
      pages: [
        {
          items: mockState.buildMediaItems(8)
        }
      ]
    };
    mockState.albumsData = [{ albumId: 'album-1', name: 'Travel' }];

    render(<DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />);

    expect(screen.getByText('Albums')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Travel/ }));

    expect(screen.getByText('Album: Travel')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Upload media' })).toBeInTheDocument();
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
