import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/apiClient';
import type { DirectoryChildRecord } from '@/lib/apiTypes';
import { DockspaceFilesPage } from '@/pages/DockspaceFilesPage';
import { createTestQueryClient, QueryWrapper } from '@/tests/testUtils';

const TIMESTAMP = '2025-09-15T12:00:00.000Z';

const folder = (childId: string, name: string, parentFolderNodeId = 'root'): DirectoryChildRecord => ({
  childId,
  childType: 'folder',
  name,
  normalizedName: name.toLowerCase(),
  parentFolderNodeId,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
});

const file = (childId: string, name: string, parentFolderNodeId = 'root'): DirectoryChildRecord => ({
  childId,
  childType: 'file',
  name,
  normalizedName: name.toLowerCase(),
  parentFolderNodeId,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
});

const DEFAULT_TREE: Record<string, DirectoryChildRecord[]> = {
  root: [folder('d_docs', 'Documents'), folder('d_travel', 'Travel'), file('f_readme', 'README.md')],
  d_travel: [
    folder('d_japan', 'Japan 2024', 'd_travel'),
    folder('d_lisbon', 'Lisbon 2025', 'd_travel'),
    file('f_packing', 'packing-list.txt', 'd_travel')
  ],
  d_lisbon: [
    folder('d_daytrips', 'Day trips', 'd_lisbon'),
    file('f_4821', 'IMG_4821.jpg', 'd_lisbon'),
    file('f_4826', 'IMG_4826.jpg', 'd_lisbon')
  ],
  d_japan: [file('f_tokyo', 'tokyo.jpg', 'd_japan')],
  d_docs: [],
  d_daytrips: []
};

const mockState = vi.hoisted(() => ({
  tree: {} as Record<string, unknown[]>,
  filesError: null as unknown,
  resultCache: new Map<string, unknown>(),
  // Bumped when a mocked listing reloads, so components using `useFiles` re-render (like a refetch).
  listingVersion: 0,
  listingListeners: new Set<() => void>(),
  moveToTrash: vi.fn(async () => {}),
  moveFiles: vi.fn(async () => ({ moved: [], failed: [] })),
  moveFolder: vi.fn(async () => ({ status: 'MOVED', from: '/docs', to: '/archive/docs', moved: true })),
  renameFile: vi.fn(async () => {}),
  renameFolder: vi.fn(async () => {}),
  isPhone: false
}));

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ dockspaceId: 'v1' }),
  Link: ({ children, ...props }: { children?: unknown }) => <a {...props}>{children as any}</a>
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/auth/UnauthorizedNotice', () => ({
  UnauthorizedNotice: () => <div>UnauthorizedNotice</div>
}));

vi.mock('@/components/files/FilePreviewContent', () => ({
  FilePreviewContent: ({ file }: { file: { fullPath: string } | null }) => (
    <div>Preview content for {file?.fullPath}</div>
  )
}));

vi.mock('@/lib/dockspaceApi', () => ({
  createFileDownloadSession: vi.fn(async () => ({
    downloadUrl: 'https://example.com/file',
    contentType: 'image/jpeg',
    size: 3_040_870
  })),
  createFolderDownloadSession: vi.fn(async () => ({ downloadUrl: null }))
}));

vi.mock('@/hooks/useFiles', async () => {
  const { useSyncExternalStore } = await vi.importActual<typeof import('react')>('react');
  const subscribe = (listener: () => void) => {
    mockState.listingListeners.add(listener);
    return () => {
      mockState.listingListeners.delete(listener);
    };
  };
  const resultFor = (folderNodeId: string) => {
    const key = `${folderNodeId}:${mockState.filesError ? 'error' : 'ok'}`;
    if (!mockState.resultCache.has(key)) {
      mockState.resultCache.set(key, {
        isLoading: false,
        data: { parentFolderNodeId: folderNodeId, items: mockState.tree[folderNodeId] ?? [] },
        error: mockState.filesError
      });
    }

    return mockState.resultCache.get(key);
  };

  return {
    useFiles: (_dockspaceId: string, folderNodeId: string) => {
      useSyncExternalStore(subscribe, () => mockState.listingVersion);
      return resultFor(folderNodeId);
    },
    useDiscoverFolder: () => ({
      mutateAsync: vi.fn(async (folderNodeId: string) => ({
        parentFolderNodeId: folderNodeId,
        items: mockState.tree[folderNodeId] ?? []
      }))
    }),
    useMoveFiles: () => ({ mutateAsync: mockState.moveFiles, isPending: false, error: null }),
    useMoveFolder: () => ({ mutateAsync: mockState.moveFolder, isPending: false, error: null }),
    useMoveToTrash: () => ({ mutateAsync: mockState.moveToTrash }),
    useRenameFile: () => ({ mutateAsync: mockState.renameFile, isPending: false, error: null }),
    useRenameFolder: () => ({ mutateAsync: mockState.renameFolder, isPending: false, error: null }),
    useCreateFolder: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false, error: null }),
    useUploadFile: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false, error: null })
  };
});

vi.mock('@/hooks/useDockspaces', () => ({
  useDockspaces: () => ({
    data: [
      {
        dockspaceId: 'v1',
        name: 'My Dockspace',
        dockspaceType: 'GENERIC_FILES'
      }
    ]
  })
}));

/** Replaces a folder's mocked listing and notifies `useFiles` users, like a refetch after invalidation. */
const reloadListing = (folderNodeId: string, items: DirectoryChildRecord[]) => {
  mockState.tree = { ...mockState.tree, [folderNodeId]: items };
  for (const key of Array.from(mockState.resultCache.keys())) {
    if (key.startsWith(`${folderNodeId}:`)) {
      mockState.resultCache.delete(key);
    }
  }
  mockState.listingVersion += 1;
  for (const listener of Array.from(mockState.listingListeners)) {
    listener();
  }
};

const renderPage = (ui: ReactElement = <DockspaceFilesPage />) =>
  render(<QueryWrapper client={createTestQueryClient()}>{ui}</QueryWrapper>);

const column = (name: string) => screen.getByRole('region', { name });

const fileRow = (fullPath: string): HTMLElement => {
  const row = Array.from(document.querySelectorAll<HTMLElement>('[data-file-path]')).find(
    (element) => element.dataset.filePath === fullPath
  );
  if (!row) {
    throw new Error(`No row for ${fullPath}`);
  }

  return row;
};

const openFolderInCurrentColumn = (name: string) => {
  const current = document.querySelector<HTMLElement>('.dockspace-column--current');
  if (!current) {
    throw new Error('No current column');
  }

  fireEvent.click(within(current).getByRole('button', { name: new RegExp(`^${name}`) }));
};

beforeEach(() => {
  mockState.tree = DEFAULT_TREE;
  mockState.filesError = null;
  mockState.resultCache.clear();
  mockState.isPhone = false;
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DockspaceFilesPage', () => {
  it('renders the folder hierarchy in one place with the folder bar actions', () => {
    renderPage();

    expect(screen.queryByRole('list', { name: 'Folder discovery tree' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Dockspace sidebar' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Folder path' })).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Folder columns' })).toBeInTheDocument();
    expect(within(column('My Dockspace')).getByRole('button', { name: /^Travel/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dockspace options' }));
    expect(screen.getByRole('menuitem', { name: 'Trash' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Detailed usage' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Create folder' })).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'New folder' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(screen.getByRole('menuitem', { name: 'Upload files' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Upload folder' })).toBeInTheDocument();
  });

  it('has exactly one h1 on desktop, naming the open folder, also with the preview open', () => {
    renderPage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'My Dockspace' })).toBeInTheDocument();

    openFolderInCurrentColumn('Travel');
    openFolderInCurrentColumn('Japan 2024');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Japan 2024' })).toBeInTheDocument();

    fireEvent.click(fileRow('/Travel/Japan 2024/tokyo.jpg'));
    expect(screen.getByRole('complementary', { name: 'File preview' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('opens the add folder dialog from the folder bar', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'New folder' }));
    expect(screen.getByRole('dialog', { name: 'Add folder' })).toBeInTheDocument();
  });

  it('shows the parent column with the open folder marked and switches to a sibling', () => {
    renderPage();

    openFolderInCurrentColumn('Travel');
    openFolderInCurrentColumn('Lisbon 2025');

    expect(within(column('My Dockspace')).getByRole('button', { name: /^Travel/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(within(column('Travel')).getByRole('button', { name: /^Lisbon 2025/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
    expect(within(column('Travel')).getByRole('button', { name: /^Japan 2024/ })).not.toHaveAttribute(
      'aria-current'
    );
    expect(column('Lisbon 2025')).toHaveClass('dockspace-column--current');
    expect(column('My Dockspace')).toHaveClass('dockspace-column--older');
    expect(column('Travel')).not.toHaveClass('dockspace-column--older');

    fireEvent.click(within(column('Travel')).getByRole('button', { name: /^Japan 2024/ }));

    expect(column('Japan 2024')).toHaveClass('dockspace-column--current');
    expect(screen.queryByRole('region', { name: 'Lisbon 2025' })).not.toBeInTheDocument();
    expect(fileRow('/Travel/Japan 2024/tokyo.jpg')).toBeInTheDocument();
  });

  it('opens the root and any ancestor from the breadcrumb in one click', () => {
    renderPage();

    openFolderInCurrentColumn('Travel');
    openFolderInCurrentColumn('Lisbon 2025');

    const breadcrumb = screen.getByRole('navigation', { name: 'Folder path' });
    expect(within(breadcrumb).getByText('Lisbon 2025')).toHaveAttribute('aria-current', 'page');

    fireEvent.click(within(breadcrumb).getByRole('button', { name: 'Travel' }));
    expect(column('Travel')).toHaveClass('dockspace-column--current');
    expect(screen.queryByRole('region', { name: 'Lisbon 2025' })).not.toBeInTheDocument();

    openFolderInCurrentColumn('Lisbon 2025');
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Folder path' })).getByRole('button', {
        name: 'My Dockspace'
      })
    );
    expect(column('My Dockspace')).toHaveClass('dockspace-column--current');
    expect(screen.queryByRole('region', { name: 'Travel' })).not.toBeInTheDocument();
  });

  it('previews a file in a side panel that is replaced, closed with Escape and closed by navigation', async () => {
    renderPage();

    openFolderInCurrentColumn('Travel');
    openFolderInCurrentColumn('Lisbon 2025');
    fireEvent.click(fileRow('/Travel/Lisbon 2025/IMG_4821.jpg'));

    const preview = screen.getByRole('complementary', { name: 'File preview' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(preview).getByRole('heading', { level: 2, name: 'IMG_4821.jpg' })).toBeInTheDocument();
    expect(within(preview).getByRole('button', { name: 'Download' })).toBeInTheDocument();
    expect(within(preview).getByRole('button', { name: 'Close preview' })).toBeInTheDocument();
    expect(within(preview).getByText('My Dockspace / Travel / Lisbon 2025')).toBeInTheDocument();
    expect(fileRow('/Travel/Lisbon 2025/IMG_4821.jpg')).toHaveAttribute('aria-current', 'true');
    await waitFor(() => expect(within(preview).getByText('2.9 MB')).toBeInTheDocument());
    expect(within(preview).getByText('JPEG image')).toBeInTheDocument();

    fireEvent.click(fileRow('/Travel/Lisbon 2025/IMG_4826.jpg'));
    expect(
      within(screen.getByRole('complementary', { name: 'File preview' })).getByRole('heading', {
        name: 'IMG_4826.jpg'
      })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('complementary', { name: 'File preview' })).toHaveLength(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'File preview' })).not.toBeInTheDocument();
    expect(fileRow('/Travel/Lisbon 2025/IMG_4826.jpg')).toHaveFocus();

    fireEvent.click(fileRow('/Travel/Lisbon 2025/IMG_4821.jpg'));
    expect(screen.getByRole('complementary', { name: 'File preview' })).toBeInTheDocument();
    openFolderInCurrentColumn('Day trips');
    expect(screen.queryByRole('complementary', { name: 'File preview' })).not.toBeInTheDocument();
  });

  it('scrolls the current column into view when the side preview opens or closes', () => {
    const observers: Array<{ callback: () => void; target: Element | null }> = [];
    const originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      private readonly entry: { callback: () => void; target: Element | null };
      constructor(callback: () => void) {
        this.entry = { callback, target: null };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.target = target;
      }
      unobserve() {}
      disconnect() {
        this.entry.target = null;
      }
    } as unknown as typeof ResizeObserver;

    try {
      renderPage();
      openFolderInCurrentColumn('Travel');
      openFolderInCurrentColumn('Lisbon 2025');

      const strip = screen.getByRole('group', { name: 'Folder columns' });
      Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 1100 });
      strip.scrollLeft = 0;

      fireEvent.click(fileRow('/Travel/Lisbon 2025/IMG_4821.jpg'));
      expect(strip.scrollLeft).toBe(1100);

      strip.scrollLeft = 0;
      const activeObserver = observers.find((observer) => observer.target === strip);
      expect(activeObserver).toBeDefined();
      activeObserver?.callback();
      expect(strip.scrollLeft).toBe(1100);

      strip.scrollLeft = 0;
      fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
      expect(strip.scrollLeft).toBe(1100);
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it('closes the preview with the close button', () => {
    renderPage();

    fireEvent.click(fileRow('/README.md'));
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));

    expect(screen.queryByRole('complementary', { name: 'File preview' })).not.toBeInTheDocument();
  });

  it('lets an open menu consume Escape before the preview', () => {
    renderPage();

    fireEvent.click(fileRow('/README.md'));
    fireEvent.click(screen.getByRole('button', { name: 'Dockspace options' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'File preview' })).toBeInTheDocument();
  });

  it('opens the folder of a file clicked in an ancestor column and previews it', () => {
    renderPage();

    openFolderInCurrentColumn('Travel');
    openFolderInCurrentColumn('Lisbon 2025');
    fireEvent.click(within(column('Travel')).getByRole('button', { name: /packing-list\.txt/ }));

    expect(column('Travel')).toHaveClass('dockspace-column--current');
    expect(
      within(screen.getByRole('complementary', { name: 'File preview' })).getByRole('heading', {
        name: 'packing-list.txt'
      })
    ).toBeInTheDocument();
    expect(fileRow('/Travel/packing-list.txt')).toHaveAttribute('aria-current', 'true');
  });

  it('shows folder file counts and hides the uploads card when there is nothing to show', async () => {
    renderPage();

    openFolderInCurrentColumn('Travel');

    await waitFor(() =>
      expect(
        within(column('Travel')).getByRole('button', { name: /^Lisbon 2025.*2 files/ })
      ).toBeInTheDocument()
    );
    expect(screen.queryByRole('region', { name: 'Uploads' })).not.toBeInTheDocument();
  });

  describe('folder file counts after moving files', () => {
    const folderRow = (columnName: string, folderName: string, count: string) =>
      within(column(columnName)).getByRole('button', {
        name: new RegExp(`^${folderName}.*${count}`)
      });

    const openCrumb = (name: string) =>
      fireEvent.click(
        within(screen.getByRole('navigation', { name: 'Folder path' })).getByRole('button', { name })
      );

    const moveSelectedFilesTo = async (destinationPath: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'Move' }));
      const dialog = await screen.findByRole('dialog', { name: 'Move files' });
      fireEvent.change(within(dialog).getByLabelText('Destination folder'), {
        target: { value: destinationPath }
      });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Move' }));
    };

    // The open folder's listing reloads after a move (query invalidation). On the live site the
    // reloaded listing usually lands before the move request resolves, so these mocks do the same.
    const resolveMoveAfterListingReload = (
      response: unknown,
      reloads: Array<[folderNodeId: string, items: DirectoryChildRecord[]]>
    ) =>
      mockState.moveFiles.mockImplementationOnce((async () => {
        await Promise.resolve();
        act(() => {
          for (const [folderNodeId, items] of reloads) {
            reloadListing(folderNodeId, items);
          }
        });
        return response;
      }) as never);

    it('updates the destination and source folder counts after a successful move', async () => {
      resolveMoveAfterListingReload(
        {
          targetFolderPath: '/Travel/Japan 2024',
          moved: [{ from: '/Travel/packing-list.txt', to: '/Travel/Japan 2024/packing-list.txt' }],
          failed: []
        },
        [['d_travel', DEFAULT_TREE.d_travel!.filter((item) => item.childId !== 'f_packing')]]
      );
      renderPage();
      await waitFor(() => expect(folderRow('My Dockspace', 'Travel', '1 file')).toBeInTheDocument());

      openFolderInCurrentColumn('Travel');
      await waitFor(() => expect(folderRow('Travel', 'Japan 2024', '1 file')).toBeInTheDocument());
      expect(folderRow('Travel', 'Lisbon 2025', '2 files')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('checkbox', { name: 'Select packing-list.txt' }));
      await moveSelectedFilesTo('/Travel/Japan 2024');

      await waitFor(() => expect(folderRow('Travel', 'Japan 2024', '2 files')).toBeInTheDocument());
      expect(folderRow('Travel', 'Lisbon 2025', '2 files')).toBeInTheDocument();
      expect(mockState.moveFiles).toHaveBeenCalledWith({
        sourcePaths: ['/Travel/packing-list.txt'],
        targetFolderPath: '/Travel/Japan 2024'
      });

      // The source folder's row, shown in its parent folder, drops the moved file too.
      openCrumb('My Dockspace');
      await waitFor(() => expect(folderRow('My Dockspace', 'Travel', '0 files')).toBeInTheDocument());
      expect(folderRow('My Dockspace', 'Documents', '0 files')).toBeInTheDocument();
    });

    it('counts only the files that moved when part of the move fails', async () => {
      resolveMoveAfterListingReload(
        {
          targetFolderPath: '/Travel/Lisbon 2025/Day trips',
          moved: [
            { from: '/Travel/Lisbon 2025/IMG_4821.jpg', to: '/Travel/Lisbon 2025/Day trips/IMG_4821.jpg' }
          ],
          failed: [
            {
              from: '/Travel/Lisbon 2025/IMG_4826.jpg',
              code: 'CONFLICT',
              error: 'A file with this name already exists in the destination folder'
            }
          ]
        },
        [['d_lisbon', DEFAULT_TREE.d_lisbon!.filter((item) => item.childId !== 'f_4821')]]
      );
      renderPage();

      openFolderInCurrentColumn('Travel');
      await waitFor(() => expect(folderRow('Travel', 'Lisbon 2025', '2 files')).toBeInTheDocument());
      openFolderInCurrentColumn('Lisbon 2025');
      await waitFor(() =>
        expect(folderRow('Lisbon 2025', 'Day trips', '0 files')).toBeInTheDocument()
      );

      fireEvent.click(screen.getByRole('checkbox', { name: 'Select IMG_4821.jpg' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select IMG_4826.jpg' }));
      await moveSelectedFilesTo('/Travel/Lisbon 2025/Day trips');

      await waitFor(() => expect(folderRow('Lisbon 2025', 'Day trips', '1 file')).toBeInTheDocument());
      expect(
        within(screen.getByRole('dialog', { name: 'Move files' })).getByText(
          'A file with this name already exists in the destination folder'
        )
      ).toBeInTheDocument();

      fireEvent.click(
        within(screen.getByRole('dialog', { name: 'Move files' })).getByRole('button', { name: 'Cancel' })
      );
      openCrumb('Travel');
      await waitFor(() => expect(folderRow('Travel', 'Lisbon 2025', '1 file')).toBeInTheDocument());
      expect(folderRow('Travel', 'Japan 2024', '1 file')).toBeInTheDocument();
    });

    describe('open source folder whose listing reloads after the move', () => {
      const LISBON_BEFORE = [...DEFAULT_TREE.d_lisbon!, file('f_4830', 'IMG_4830.jpg', 'd_lisbon')];
      const LISBON_AFTER = LISBON_BEFORE.filter((item) => item.childId !== 'f_4821');
      const RESPONSE = {
        targetFolderPath: '/Travel/Lisbon 2025/Day trips',
        moved: [
          { from: '/Travel/Lisbon 2025/IMG_4821.jpg', to: '/Travel/Lisbon 2025/Day trips/IMG_4821.jpg' }
        ],
        failed: []
      };

      const openLisbonAndMoveOneFile = async () => {
        renderPage();
        openFolderInCurrentColumn('Travel');
        await waitFor(() => expect(folderRow('Travel', 'Lisbon 2025', '3 files')).toBeInTheDocument());
        openFolderInCurrentColumn('Lisbon 2025');
        await waitFor(() =>
          expect(folderRow('Lisbon 2025', 'Day trips', '0 files')).toBeInTheDocument()
        );

        fireEvent.click(screen.getByRole('checkbox', { name: 'Select IMG_4821.jpg' }));
        await moveSelectedFilesTo('/Travel/Lisbon 2025/Day trips');
        await waitFor(() => expect(screen.getByText('1 file moved.')).toBeInTheDocument());
      };

      const expectCountsAfterMove = async () => {
        expect(folderRow('Lisbon 2025', 'Day trips', '1 file')).toBeInTheDocument();
        openCrumb('Travel');
        // 3 files, 1 moved out: "2 files", not "1 file" (the moved file subtracted twice).
        await waitFor(() => expect(folderRow('Travel', 'Lisbon 2025', '2 files')).toBeInTheDocument());
      };

      beforeEach(() => {
        mockState.tree = { ...DEFAULT_TREE, d_lisbon: LISBON_BEFORE };
      });

      it('subtracts the moved files once when the listing reloads before the move resolves', async () => {
        resolveMoveAfterListingReload(RESPONSE, [['d_lisbon', LISBON_AFTER]]);

        await openLisbonAndMoveOneFile();
        await expectCountsAfterMove();
      });

      it('subtracts the moved files once when the listing reloads after the move resolves', async () => {
        mockState.moveFiles.mockResolvedValueOnce(RESPONSE as never);

        await openLisbonAndMoveOneFile();
        act(() => reloadListing('d_lisbon', LISBON_AFTER));
        await expectCountsAfterMove();
      });
    });

    it('leaves the counts as they are when the files stay in their folder', async () => {
      mockState.moveFiles.mockResolvedValueOnce({
        targetFolderPath: '/Travel',
        moved: [{ from: '/Travel/packing-list.txt', to: '/Travel/packing-list.txt' }],
        failed: []
      } as never);
      renderPage();
      await waitFor(() => expect(folderRow('My Dockspace', 'Travel', '1 file')).toBeInTheDocument());

      openFolderInCurrentColumn('Travel');
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select packing-list.txt' }));
      await moveSelectedFilesTo('/Travel');
      await waitFor(() => expect(screen.getByText('1 file moved.')).toBeInTheDocument());

      openCrumb('My Dockspace');
      await waitFor(() => expect(folderRow('My Dockspace', 'Travel', '1 file')).toBeInTheDocument());
    });
  });

  describe('file sizes from the folder listing', () => {
    const SIZED_TREE: Record<string, DirectoryChildRecord[]> = {
      ...DEFAULT_TREE,
      d_travel: [
        folder('d_japan', 'Japan 2024', 'd_travel'),
        folder('d_lisbon', 'Lisbon 2025', 'd_travel'),
        { ...file('f_packing', 'packing-list.txt', 'd_travel'), size: 2_048 }
      ],
      d_lisbon: [
        folder('d_daytrips', 'Day trips', 'd_lisbon'),
        { ...file('f_4821', 'IMG_4821.jpg', 'd_lisbon'), size: 1_572_864 },
        file('f_4826', 'IMG_4826.jpg', 'd_lisbon')
      ]
    };

    const fileSizeText = (fullPath: string) =>
      fileRow(fullPath).querySelector('.dockspace-browser__file-size')?.textContent;

    it('shows sizes in the current column and ancestor columns, with the Size header', () => {
      mockState.tree = SIZED_TREE;
      renderPage();

      expect(column('My Dockspace').querySelector('.dockspace-browser')).toHaveAttribute(
        'data-has-sizes',
        'false'
      );

      openFolderInCurrentColumn('Travel');
      openFolderInCurrentColumn('Lisbon 2025');

      const current = column('Lisbon 2025');
      expect(current.querySelector('.dockspace-browser')).toHaveAttribute('data-has-sizes', 'true');
      expect(within(current).getByText('Size')).toBeInTheDocument();
      expect(fileSizeText('/Travel/Lisbon 2025/IMG_4821.jpg')).toBe('1.5 MB');
      // A file without a stored size renders no size, without breaking the row.
      expect(fileSizeText('/Travel/Lisbon 2025/IMG_4826.jpg')).toBe('');

      const ancestorFile = within(column('Travel')).getByRole('button', { name: /packing-list\.txt/ });
      expect(within(ancestorFile).getByText('2 KB')).toBeInTheDocument();
    });

    it('uses the listing size in the preview details', async () => {
      mockState.tree = SIZED_TREE;
      renderPage();

      openFolderInCurrentColumn('Travel');
      openFolderInCurrentColumn('Lisbon 2025');
      fireEvent.click(fileRow('/Travel/Lisbon 2025/IMG_4821.jpg'));

      const preview = screen.getByRole('complementary', { name: 'File preview' });
      expect(within(preview).getByText('1.5 MB')).toBeInTheDocument();
      // Wait for the download session (which reports another size) and check the listing size still wins.
      await waitFor(() => expect(within(preview).getByText('JPEG image')).toBeInTheDocument());
      expect(within(preview).queryByText('2.9 MB')).not.toBeInTheDocument();
    });

    it('shows sizes in phone rows', () => {
      mockState.isPhone = true;
      mockState.tree = SIZED_TREE;
      renderPage();

      openFolderInCurrentColumn('Travel');

      expect(fileSizeText('/Travel/packing-list.txt')).toBe('2 KB');
      expect(
        fileRow('/Travel/packing-list.txt').closest('.dockspace-browser')
      ).toHaveAttribute('data-has-sizes', 'true');
    });
  });

  it('uses one folder at a time on phone, with back, sibling chips and a full-width preview', () => {
    mockState.isPhone = true;
    renderPage();

    expect(screen.queryByRole('group', { name: 'Folder columns' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'My Dockspace' })).toBeInTheDocument();

    openFolderInCurrentColumn('Travel');
    openFolderInCurrentColumn('Lisbon 2025');

    expect(screen.getByRole('heading', { level: 1, name: 'Lisbon 2025' })).toBeInTheDocument();
    const chips = screen.getByRole('region', { name: 'In Travel' });
    expect(within(chips).getByRole('button', { name: 'Lisbon 2025' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getAllByRole('navigation', { name: 'Folder path' })).toHaveLength(1);

    fireEvent.click(within(chips).getByRole('button', { name: 'Japan 2024' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Japan 2024' })).toBeInTheDocument();

    fireEvent.click(fileRow('/Travel/Japan 2024/tokyo.jpg'));
    const preview = screen.getByRole('complementary', { name: 'File preview' });
    expect(within(preview).getByRole('button', { name: 'Back to Japan 2024' })).toBeInTheDocument();
    expect(within(preview).queryByRole('button', { name: 'Close preview' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(within(preview).getByRole('heading', { level: 1, name: 'tokyo.jpg' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();

    fireEvent.click(within(preview).getByRole('button', { name: 'Back to Japan 2024' }));
    expect(screen.queryByRole('complementary', { name: 'File preview' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Japan 2024' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to Travel' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Travel' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Folder options' }));
    expect(screen.getByRole('menuitem', { name: 'New folder' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Trash' })).toBeInTheDocument();
  });

  describe('touch phone: selection mode and press-and-hold menus', () => {
    const touchPress = (element: HTMLElement, x = 40, y = 120) => {
      fireEvent.pointerDown(element, { pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: x, clientY: y });
    };

    const previewRegion = () => screen.queryByRole('complementary', { name: 'File preview' });

    beforeEach(() => {
      mockState.isPhone = true;
    });

    it('starts selection mode from Folder options and leaves it with Cancel', () => {
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Folder options' }));
      const menu = screen.getByRole('menu', { name: 'Folder options' });
      const items = within(menu).getAllByRole('menuitem');
      expect(items[0]).toHaveTextContent('Select items');
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Select items' }));

      expect(screen.queryByRole('menu', { name: 'Folder options' })).not.toBeInTheDocument();
      const status = screen.getByText('Tap files to select');
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(status).toHaveFocus();
      expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
      expect(screen.getByRole('checkbox', { name: 'Select README.md' })).not.toBeChecked();
      expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Folder options' }));
      expect(screen.queryByRole('menuitem', { name: 'Select items' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Folder options' }));

      // Tapping a file row toggles it instead of previewing.
      fireEvent.click(fileRow('/README.md'));
      expect(previewRegion()).not.toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Select README.md' })).toBeChecked();
      expect(screen.getByText('1 file selected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Move' })).toBeEnabled();

      // Deselecting the last file keeps the mode on.
      fireEvent.click(fileRow('/README.md'));
      expect(screen.getByText('Tap files to select')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Move' })).toBeDisabled();

      // Folders are inert while selecting.
      const travel = screen.getByRole('button', { name: /^Travel/ });
      expect(travel).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(travel);
      expect(screen.getByRole('heading', { level: 1, name: 'My Dockspace' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText('Tap files to select')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();

      fireEvent.click(fileRow('/README.md'));
      expect(previewRegion()).toBeInTheDocument();
    });

    it('hides the parent folder chips while selecting and resets the mode when the folder changes', () => {
      renderPage();
      openFolderInCurrentColumn('Travel');
      openFolderInCurrentColumn('Lisbon 2025');
      expect(screen.getByRole('region', { name: 'In Travel' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Folder options' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Select items' }));
      expect(screen.queryByRole('region', { name: 'In Travel' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Back to Travel' }));
      expect(screen.getByRole('heading', { level: 1, name: 'Travel' })).toBeInTheDocument();
      expect(screen.queryByText('Tap files to select')).not.toBeInTheDocument();
    });

    it('renders no row ⋯ buttons and describes the press-and-hold menu', () => {
      renderPage();

      expect(screen.queryAllByRole('button', { name: /^Actions for/ })).toHaveLength(0);
      const hintId = fileRow('/README.md').getAttribute('aria-describedby');
      expect(hintId).toBeTruthy();
      expect(document.getElementById(hintId as string)).toHaveTextContent(
        'Press and hold, or press Shift+F10, for more actions.'
      );
      expect(screen.getByRole('button', { name: /^Travel/ })).toHaveAttribute('aria-describedby', hintId);
      expect(fileRow('/README.md')).not.toHaveAttribute('aria-haspopup');
    });

    it('opens the item menu after a 500 ms press and swallows the click that follows', () => {
      renderPage();
      vi.useFakeTimers();
      const row = fileRow('/README.md');

      touchPress(row);
      act(() => {
        vi.advanceTimersByTime(499);
      });
      expect(screen.queryByRole('menu', { name: 'Actions for README.md' })).not.toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(1);
      });

      const menu = screen.getByRole('menu', { name: 'Actions for README.md' });
      expect(within(menu).getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
      expect(within(menu).getByRole('menuitem', { name: 'Download' })).toBeInTheDocument();
      expect(within(menu).getByRole('menuitem', { name: 'Move to Trash' })).toBeInTheDocument();

      fireEvent.pointerUp(row, { pointerType: 'touch', pointerId: 1 });
      fireEvent.click(row);
      expect(previewRegion()).not.toBeInTheDocument();

      // The Android contextmenu that follows a long-press does not open a second menu.
      expect(fireEvent.contextMenu(row)).toBe(false);
      expect(screen.getAllByRole('menu', { name: 'Actions for README.md' })).toHaveLength(1);
    });

    it('keeps focus in the press-and-hold menu when the finger lifts', () => {
      renderPage();
      vi.useFakeTimers();
      const row = fileRow('/README.md');

      touchPress(row);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      const menu = screen.getByRole('menu', { name: 'Actions for README.md' });
      const rename = within(menu).getByRole('menuitem', { name: 'Rename' });
      expect(rename).toHaveFocus();

      // The release must not act like a tap: no compatibility mouse events, no focus move to the row.
      fireEvent.pointerUp(row, { pointerType: 'touch', pointerId: 1 });
      expect(fireEvent.touchEnd(row)).toBe(false);
      expect(fireEvent.mouseDown(row)).toBe(false);

      // If a browser still focuses the row, focus goes back to the first menu item.
      act(() => {
        row.focus();
      });
      expect(rename).toHaveFocus();
      expect(screen.getByRole('menu', { name: 'Actions for README.md' })).toBeInTheDocument();

      // Escape closes the menu and focus returns to the row, where it stays.
      fireEvent.keyDown(rename, { key: 'Escape' });
      act(() => {
        vi.runOnlyPendingTimers();
      });
      expect(screen.queryByRole('menu', { name: 'Actions for README.md' })).not.toBeInTheDocument();
      expect(row).toHaveFocus();
    });

    it('does not swallow the next keyboard activation of the row after a press and hold', () => {
      renderPage();
      vi.useFakeTimers();
      const row = fileRow('/README.md');

      // Release cancelled (no click follows), then Escape and Enter on the row.
      touchPress(row);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      fireEvent.pointerUp(row, { pointerType: 'touch', pointerId: 1 });
      expect(fireEvent.touchEnd(row)).toBe(false);
      const firstMenu = screen.getByRole('menu', { name: 'Actions for README.md' });
      fireEvent.keyDown(within(firstMenu).getByRole('menuitem', { name: 'Rename' }), { key: 'Escape' });
      act(() => {
        vi.runOnlyPendingTimers();
      });
      expect(row).toHaveFocus();
      fireEvent.click(row);
      expect(previewRegion()).toBeInTheDocument();

      // Android path: the contextmenu during the hold opens the menu; closing it must also clear the swallow.
      fireEvent.click(screen.getByRole('button', { name: 'Back to My Dockspace' }));
      const sameRow = fileRow('/README.md');
      touchPress(sameRow);
      expect(fireEvent.contextMenu(sameRow, { clientX: 10, clientY: 10 })).toBe(false);
      const menu = screen.getByRole('menu', { name: 'Actions for README.md' });
      fireEvent.pointerUp(sameRow, { pointerType: 'touch', pointerId: 1 });
      fireEvent.keyDown(within(menu).getByRole('menuitem', { name: 'Rename' }), { key: 'Escape' });
      act(() => {
        vi.runOnlyPendingTimers();
      });
      expect(screen.queryByRole('menu', { name: 'Actions for README.md' })).not.toBeInTheDocument();
      fireEvent.click(sameRow);
      expect(previewRegion()).toBeInTheDocument();
    });

    it('does not cancel the touch release or mousedown of a normal tap', () => {
      renderPage();
      vi.useFakeTimers();
      const row = fileRow('/README.md');

      touchPress(row);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      fireEvent.pointerUp(row, { pointerType: 'touch', pointerId: 1 });
      expect(fireEvent.touchEnd(row)).toBe(true);
      expect(fireEvent.mouseDown(row)).toBe(true);
    });

    it('opens a folder menu on press and hold without opening the folder', () => {
      renderPage();
      vi.useFakeTimers();
      const travel = screen.getByRole('button', { name: /^Travel/ });

      touchPress(travel);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      const menu = screen.getByRole('menu', { name: 'Actions for Travel' });
      expect(within(menu).getByRole('menuitem', { name: 'Move' })).toBeInTheDocument();

      fireEvent.pointerUp(travel, { pointerType: 'touch', pointerId: 1 });
      fireEvent.click(travel);
      expect(screen.getByRole('heading', { level: 1, name: 'My Dockspace' })).toBeInTheDocument();
    });

    it('treats a short press as a tap and cancels a press that moves', () => {
      renderPage();
      vi.useFakeTimers();
      const row = fileRow('/README.md');

      touchPress(row);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(row).toHaveAttribute('data-pressed', 'true');
      fireEvent.pointerUp(row, { pointerType: 'touch', pointerId: 1 });
      expect(row).not.toHaveAttribute('data-pressed');
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.queryByRole('menu', { name: 'Actions for README.md' })).not.toBeInTheDocument();
      fireEvent.click(row);
      expect(previewRegion()).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Back to My Dockspace' }));
      const sameRow = fileRow('/README.md');
      touchPress(sameRow, 40, 120);
      fireEvent.pointerMove(sameRow, { pointerType: 'touch', pointerId: 1, clientX: 40, clientY: 131 });
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.queryByRole('menu', { name: 'Actions for README.md' })).not.toBeInTheDocument();
    });

    it('ignores a mouse press held down and does not open menus in selection mode', () => {
      renderPage();
      vi.useFakeTimers();

      fireEvent.pointerDown(fileRow('/README.md'), { pointerType: 'mouse', pointerId: 1, clientX: 5, clientY: 5 });
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.queryByRole('menu', { name: 'Actions for README.md' })).not.toBeInTheDocument();
      fireEvent.pointerUp(fileRow('/README.md'), { pointerType: 'mouse', pointerId: 1 });

      fireEvent.click(screen.getByRole('button', { name: 'Folder options' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Select items' }));
      touchPress(fileRow('/README.md'));
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.queryByRole('menu', { name: 'Actions for README.md' })).not.toBeInTheDocument();
      expect(fireEvent.contextMenu(fileRow('/README.md'))).toBe(false);
      expect(screen.queryByRole('menu', { name: 'Actions for README.md' })).not.toBeInTheDocument();
    });

    it('prevents the native context menu and opens the item menu from it once', () => {
      renderPage();

      expect(fireEvent.contextMenu(fileRow('/README.md'), { clientX: 30, clientY: 40 })).toBe(false);
      expect(screen.getAllByRole('menu', { name: 'Actions for README.md' })).toHaveLength(1);
    });

    it('opens the item menu with Shift+F10 and returns focus to the row on Escape', async () => {
      renderPage();
      const row = fileRow('/README.md');
      row.focus();

      fireEvent.keyDown(row, { key: 'F10', shiftKey: true });
      const menu = screen.getByRole('menu', { name: 'Actions for README.md' });
      expect(within(menu).getByRole('menuitem', { name: 'Rename' })).toHaveFocus();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('menu', { name: 'Actions for README.md' })).not.toBeInTheDocument();
      await waitFor(() => expect(row).toHaveFocus());

      fireEvent.keyDown(row, { key: 'ContextMenu' });
      expect(screen.getByRole('menu', { name: 'Actions for README.md' })).toBeInTheDocument();
    });
  });

  it('keeps the desktop row menus and has no "Select items" in Dockspace options', () => {
    renderPage();

    expect(screen.getByRole('button', { name: 'Actions for README.md' })).toBeInTheDocument();
    expect(fileRow('/README.md')).not.toHaveAttribute('aria-describedby');
    fireEvent.click(screen.getByRole('button', { name: 'Dockspace options' }));
    expect(screen.queryByRole('menuitem', { name: 'Select items' })).not.toBeInTheDocument();
  });

  describe('focus after closing a file or folder dialog', () => {
    // Keyboard activation: the menu item holds focus when the dialog opens.
    const activateMenuItem = (menuName: string, itemName: string) => {
      const menu = screen.getByRole('menu', { name: menuName });
      const item = within(menu).getByRole('menuitem', { name: itemName });
      item.focus();
      fireEvent.click(item);
    };

    const openRenameFileFromTrigger = () => {
      const trigger = screen.getByRole('button', { name: 'Actions for README.md' });
      trigger.focus();
      fireEvent.click(trigger);
      activateMenuItem('Actions for README.md', 'Rename');
      expect(screen.getByRole('dialog', { name: 'Rename file' })).toBeInTheDocument();
      expect(screen.getByLabelText('File name')).toHaveFocus();
      return trigger;
    };

    it('returns focus to the row menu trigger after Escape', async () => {
      renderPage();
      const trigger = openRenameFileFromTrigger();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog', { name: 'Rename file' })).not.toBeInTheDocument();
      await waitFor(() => expect(trigger).toHaveFocus());
    });

    it('returns focus to the row menu trigger after Cancel', async () => {
      renderPage();
      const trigger = openRenameFileFromTrigger();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog', { name: 'Rename file' })).not.toBeInTheDocument();
      await waitFor(() => expect(trigger).toHaveFocus());
    });

    it('returns focus to the row menu trigger after a backdrop click', async () => {
      renderPage();
      const trigger = openRenameFileFromTrigger();

      const backdrop = screen.getByRole('dialog', { name: 'Rename file' }).parentElement as HTMLElement;
      fireEvent.mouseDown(backdrop);

      expect(screen.queryByRole('dialog', { name: 'Rename file' })).not.toBeInTheDocument();
      await waitFor(() => expect(trigger).toHaveFocus());
    });

    it('returns focus to the row when the menu was opened from the row', async () => {
      renderPage();
      const row = screen.getByRole('button', { name: /^Travel/ });
      row.focus();
      fireEvent.contextMenu(row, { clientX: 40, clientY: 120 });
      activateMenuItem('Actions for Travel', 'Rename');
      expect(screen.getByRole('dialog', { name: 'Rename folder' })).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByRole('dialog', { name: 'Rename folder' })).not.toBeInTheDocument();
      await waitFor(() => expect(row).toHaveFocus());
    });

    it('returns focus to the Move folder opener after Cancel', async () => {
      renderPage();
      const trigger = screen.getByRole('button', { name: 'Actions for Travel' });
      trigger.focus();
      fireEvent.click(trigger);
      activateMenuItem('Actions for Travel', 'Move');
      expect(screen.getByRole('dialog', { name: 'Move folder' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(trigger).toHaveFocus());
    });

    it('returns focus to the New folder button after Escape on Add folder', async () => {
      renderPage();
      const newFolder = screen.getByRole('button', { name: 'New folder' });
      newFolder.focus();
      fireEvent.click(newFolder);
      expect(screen.getByRole('dialog', { name: 'Add folder' })).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => expect(newFolder).toHaveFocus());
    });

    it('focuses the renamed file row after a successful rename', async () => {
      mockState.renameFile = vi.fn(async () => {
        mockState.tree = {
          ...DEFAULT_TREE,
          root: [folder('d_docs', 'Documents'), folder('d_travel', 'Travel'), file('f_readme', 'NOTES.md')]
        };
        mockState.resultCache.clear();
      });

      renderPage();
      openRenameFileFromTrigger();
      fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'NOTES.md' } });
      fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

      await waitFor(() => expect(mockState.renameFile).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(fileRow('/NOTES.md')).toHaveFocus());
    });

    it('focuses the list when a moved folder leaves the current folder', async () => {
      mockState.moveFolder = vi.fn(async () => {
        mockState.tree = {
          ...DEFAULT_TREE,
          root: [folder('d_docs', 'Documents'), file('f_readme', 'README.md')],
          d_docs: [folder('d_travel', 'Travel', 'd_docs')]
        };
        mockState.resultCache.clear();
        return { status: 'MOVED', from: '/Travel', to: '/Documents/Travel', moved: true };
      });

      renderPage();
      const trigger = screen.getByRole('button', { name: 'Actions for Travel' });
      trigger.focus();
      fireEvent.click(trigger);
      activateMenuItem('Actions for Travel', 'Move');
      const dialog = screen.getByRole('dialog', { name: 'Move folder' });
      fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: '/Documents' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Move' }));

      await waitFor(() => expect(mockState.moveFolder).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Move folder' })).not.toBeInTheDocument());
      await waitFor(() => expect(document.activeElement).not.toBe(document.body));
      expect(document.activeElement).toHaveAttribute('data-dialog-focus-fallback');
    });

    describe('Move to Trash confirmation', () => {
      const openTrashConfirmation = (folderName: string) => {
        const trigger = screen.getByRole('button', { name: `Actions for ${folderName}` });
        trigger.focus();
        fireEvent.click(trigger);
        activateMenuItem(`Actions for ${folderName}`, 'Move to Trash');
        expect(screen.getByRole('dialog', { name: 'Move folder to trash' })).toBeInTheDocument();
        return trigger;
      };

      const confirmWithKeyboard = () => {
        const confirm = screen.getByRole('button', { name: 'Move to trash' });
        confirm.focus();
        fireEvent.click(confirm);
      };

      const currentList = () => {
        const current = document.querySelector<HTMLElement>('.dockspace-column--current');
        const list = current?.querySelector<HTMLElement>('ul.dockspace-browser__list') ?? null;
        if (!list) {
          throw new Error('No list in the current column');
        }
        return list;
      };

      it('focuses the file list of the current folder after the folder is trashed', async () => {
        mockState.moveToTrash = vi.fn(async () => {
          mockState.tree = {
            ...DEFAULT_TREE,
            root: [folder('d_docs', 'Documents'), file('f_readme', 'README.md')]
          };
          mockState.resultCache.clear();
        });

        renderPage();
        const trigger = openTrashConfirmation('Travel');
        confirmWithKeyboard();

        await waitFor(() =>
          expect(screen.queryByRole('dialog', { name: 'Move folder to trash' })).not.toBeInTheDocument()
        );
        expect(mockState.moveToTrash).toHaveBeenCalledWith({ fullPath: '/Travel', targetType: 'folder' });
        expect(trigger.isConnected).toBe(false);
        await waitFor(() => expect(document.activeElement).not.toBe(document.body));

        const list = currentList();
        expect(list).toHaveFocus();
        expect(list).toHaveAttribute('data-dialog-focus-fallback');
        expect(list).toHaveAttribute('tabindex', '-1');
        // The next Tab starts from the list: the remaining rows are still there.
        expect(within(list).getByRole('button', { name: /^Documents/ })).toBeInTheDocument();
        expect(within(list).queryByRole('button', { name: /^Travel/ })).not.toBeInTheDocument();
      });

      it('focuses the empty list when the last folder is trashed', async () => {
        mockState.tree = { root: [folder('f_docs', 'docs')] };
        mockState.moveToTrash = vi.fn(async () => {
          mockState.tree = { root: [] };
          mockState.resultCache.clear();
        });

        renderPage();
        openTrashConfirmation('docs');
        confirmWithKeyboard();

        await waitFor(() =>
          expect(screen.queryByRole('dialog', { name: 'Move folder to trash' })).not.toBeInTheDocument()
        );
        await waitFor(() => expect(document.activeElement).not.toBe(document.body));
        expect(currentList()).toHaveFocus();
      });

      it('returns focus to the row menu trigger when the confirmation is cancelled', async () => {
        mockState.moveToTrash = vi.fn(async () => {});
        renderPage();
        const trigger = openTrashConfirmation('Travel');
        const dialog = screen.getByRole('dialog', { name: 'Move folder to trash' });
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.queryByRole('dialog', { name: 'Move folder to trash' })).not.toBeInTheDocument();
        await waitFor(() => expect(trigger).toHaveFocus());
        expect(mockState.moveToTrash).not.toHaveBeenCalled();
      });

      it('keeps focus in the dialog when moving to trash fails', async () => {
        mockState.moveToTrash = vi.fn(async () => {
          throw new Error('Failed to move folder to trash');
        });

        renderPage();
        openTrashConfirmation('Travel');
        confirmWithKeyboard();

        await waitFor(() => expect(screen.getByText('Failed to move folder to trash')).toBeInTheDocument());
        const dialog = screen.getByRole('dialog', { name: 'Move folder to trash' });
        expect(dialog).toContainElement(document.activeElement as HTMLElement);
        expect(currentList()).not.toHaveFocus();
      });

      describe('after a failed move to trash', () => {
        const folderRowButton = (fullPath: string) => {
          const row = document.querySelector<HTMLElement>(`[data-row-path="${fullPath}"]`);
          if (!row) {
            throw new Error(`No row for ${fullPath}`);
          }
          return row;
        };

        // A browser moves focus to body when the focused button is disabled; jsdom keeps it.
        const moveFocusToBody = () => {
          const placeholder = document.createElement('input');
          document.body.append(placeholder);
          placeholder.focus();
          placeholder.remove();
        };

        // The folder row is shown as a pending "Trashing..." row while the request runs, so the
        // opener captured when the dialog opened is replaced by a new element once it fails.
        let rejectTrash: (error: Error) => void = () => {};

        beforeEach(() => {
          mockState.moveToTrash = vi.fn(
            () =>
              new Promise<void>((_resolve, reject) => {
                rejectTrash = reject;
              })
          );
        });

        const failTrash = async () => {
          confirmWithKeyboard();
          await waitFor(() => expect(mockState.moveToTrash).toHaveBeenCalledTimes(1));
          expect(screen.getByText('Trashing...')).toBeInTheDocument();
          expect(document.querySelector('[data-row-path="/Travel"]')).toBeNull();
          moveFocusToBody();

          await act(async () => {
            rejectTrash(new Error('Failed to move folder to trash'));
          });
          const dialog = screen.getByRole('dialog', { name: 'Move folder to trash' });
          expect(within(dialog).getByRole('alert')).toHaveTextContent('Failed to move folder to trash');
          return dialog;
        };

        const closeDialog = {
          Escape: () => fireEvent.keyDown(document, { key: 'Escape' }),
          Cancel: (dialog: HTMLElement) =>
            fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' })),
          'a backdrop click': (dialog: HTMLElement) =>
            fireEvent.mouseDown(dialog.parentElement as HTMLElement)
        };

        it('moves focus to Cancel', async () => {
          renderPage();
          openTrashConfirmation('Travel');
          const dialog = await failTrash();

          expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
        });

        it.each(Object.entries(closeDialog))(
          'returns focus to the folder Actions trigger after %s',
          async (_name, close) => {
            renderPage();
            const trigger = openTrashConfirmation('Travel');
            const dialog = await failTrash();
            expect(trigger.isConnected).toBe(false);

            close(dialog);

            expect(screen.queryByRole('dialog', { name: 'Move folder to trash' })).not.toBeInTheDocument();
            await waitFor(() =>
              expect(screen.getByRole('button', { name: 'Actions for Travel' })).toHaveFocus()
            );
          }
        );

        it('returns focus to the folder row when the menu was opened from the row', async () => {
          renderPage();
          const row = folderRowButton('/Travel');
          row.focus();
          fireEvent.keyDown(row, { key: 'F10', shiftKey: true });
          activateMenuItem('Actions for Travel', 'Move to Trash');
          await failTrash();
          expect(row.isConnected).toBe(false);

          fireEvent.keyDown(document, { key: 'Escape' });

          await waitFor(() => expect(folderRowButton('/Travel')).toHaveFocus());
          expect(currentList()).not.toHaveFocus();
        });
      });
    });
  });

  describe('focus after moving a file to the trash from its row menu', () => {
    const THREE_FILES = [
      folder('d_docs', 'Documents'),
      file('f_a', 'a.txt'),
      file('f_b', 'b.txt'),
      file('f_c', 'c.txt')
    ];

    // The page re-renders with the refetched folder listing (react-query does this in the app).
    const renderRefreshablePage = () => {
      const client = createTestQueryClient();
      const ui = () => (
        <QueryWrapper client={client}>
          <DockspaceFilesPage />
        </QueryWrapper>
      );
      const result = render(ui());
      return { refreshList: () => result.rerender(ui()) };
    };

    const trashSucceedsRemoving = (childId: string) => {
      mockState.moveToTrash = vi.fn(async () => {
        mockState.tree = {
          ...mockState.tree,
          root: (mockState.tree.root as DirectoryChildRecord[]).filter((item) => item.childId !== childId)
        };
        mockState.resultCache.clear();
      });
    };

    const currentList = () => {
      const list = document.querySelector<HTMLElement>('.dockspace-column--current ul.dockspace-browser__list');
      if (!list) {
        throw new Error('No list in the current column');
      }
      return list;
    };

    // Keyboard: focus the menu trigger, open the menu, activate Move to Trash.
    const trashFromTrigger = (fileName: string) => {
      const trigger = screen.getByRole('button', { name: `Actions for ${fileName}` });
      trigger.focus();
      fireEvent.click(trigger);
      const item = within(screen.getByRole('menu', { name: `Actions for ${fileName}` })).getByRole(
        'menuitem',
        { name: 'Move to Trash' }
      );
      item.focus();
      fireEvent.click(item);
      return trigger;
    };

    // Keyboard: Shift+F10 on the row opens its menu with focus on the first item.
    const trashFromRowMenu = (fullPath: string, fileName: string) => {
      const row = fileRow(fullPath);
      row.focus();
      fireEvent.keyDown(row, { key: 'F10', shiftKey: true });
      const menu = screen.getByRole('menu', { name: `Actions for ${fileName}` });
      expect(menu).toContainElement(document.activeElement as HTMLElement);
      const item = within(menu).getByRole('menuitem', { name: 'Move to Trash' });
      item.focus();
      fireEvent.click(item);
      return row;
    };

    beforeEach(() => {
      mockState.tree = { root: THREE_FILES };
    });

    it('focuses the next row after trashing a file in the middle of the list', async () => {
      trashSucceedsRemoving('f_b');
      const { refreshList } = renderRefreshablePage();
      trashFromTrigger('b.txt');

      await waitFor(() => expect(mockState.moveToTrash).toHaveBeenCalledTimes(1));
      expect(mockState.moveToTrash).toHaveBeenCalledWith({ fullPath: '/b.txt', targetType: 'file' });
      refreshList();

      await waitFor(() => expect(fileRow('/c.txt')).toHaveFocus());
      expect(screen.queryByRole('button', { name: /^b\.txt/ })).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(/^File moved to trash\.$/);
    });

    it('focuses the previous row after trashing the last file', async () => {
      trashSucceedsRemoving('f_c');
      const { refreshList } = renderRefreshablePage();
      trashFromTrigger('c.txt');

      await waitFor(() => expect(mockState.moveToTrash).toHaveBeenCalledTimes(1));
      refreshList();

      await waitFor(() => expect(fileRow('/b.txt')).toHaveFocus());
    });

    it('focuses the file list after trashing the only file', async () => {
      mockState.tree = { root: [file('f_only', 'only.txt')] };
      trashSucceedsRemoving('f_only');
      const { refreshList } = renderRefreshablePage();
      trashFromTrigger('only.txt');

      await waitFor(() => expect(mockState.moveToTrash).toHaveBeenCalledTimes(1));
      refreshList();

      await waitFor(() => expect(document.activeElement).not.toBe(document.body));
      const list = currentList();
      expect(list).toHaveFocus();
      expect(list).toHaveAttribute('data-dialog-focus-fallback');
    });

    it('focuses the next row when the menu was opened from the row (right-click, ContextMenu, Shift+F10)', async () => {
      trashSucceedsRemoving('f_a');
      const { refreshList } = renderRefreshablePage();
      trashFromRowMenu('/a.txt', 'a.txt');

      await waitFor(() => expect(mockState.moveToTrash).toHaveBeenCalledTimes(1));
      refreshList();

      await waitFor(() => expect(fileRow('/b.txt')).toHaveFocus());
    });

    it('focuses the previous row from the phone item menu', async () => {
      mockState.isPhone = true;
      trashSucceedsRemoving('f_c');
      const { refreshList } = renderRefreshablePage();
      expect(screen.queryByRole('button', { name: 'Actions for c.txt' })).not.toBeInTheDocument();
      trashFromRowMenu('/c.txt', 'c.txt');

      await waitFor(() => expect(mockState.moveToTrash).toHaveBeenCalledTimes(1));
      refreshList();

      await waitFor(() => expect(fileRow('/b.txt')).toHaveFocus());
    });

    it('keeps focus on the row menu trigger while the request runs', async () => {
      let resolveTrash!: () => void;
      mockState.moveToTrash = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveTrash = () => {
              mockState.tree = { root: THREE_FILES.filter((item) => item.childId !== 'f_b') };
              mockState.resultCache.clear();
              resolve();
            };
          })
      );
      const { refreshList } = renderRefreshablePage();
      const trigger = trashFromTrigger('b.txt');

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      await waitFor(() => expect(trigger).toHaveFocus());

      await act(async () => {
        resolveTrash();
      });
      refreshList();

      await waitFor(() => expect(fileRow('/c.txt')).toHaveFocus());
    });

    it('does not take focus back when the user moved it while the request ran', async () => {
      let resolveTrash!: () => void;
      mockState.moveToTrash = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveTrash = () => {
              mockState.tree = { root: THREE_FILES.filter((item) => item.childId !== 'f_b') };
              mockState.resultCache.clear();
              resolve();
            };
          })
      );
      const { refreshList } = renderRefreshablePage();
      const trigger = trashFromTrigger('b.txt');
      await waitFor(() => expect(trigger).toHaveFocus());

      const otherRow = fileRow('/a.txt');
      otherRow.focus();
      await act(async () => {
        resolveTrash();
      });
      refreshList();
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      });

      expect(otherRow).toHaveFocus();
    });

    it('keeps the row and returns focus to its menu trigger when the trash request fails', async () => {
      mockState.moveToTrash = vi.fn(async () => {
        throw new Error('Request failed');
      });
      const { refreshList } = renderRefreshablePage();
      const trigger = trashFromTrigger('b.txt');

      await waitFor(() => expect(mockState.moveToTrash).toHaveBeenCalledTimes(1));
      refreshList();
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });

      expect(fileRow('/b.txt')).toBeInTheDocument();
      expect(trigger.isConnected).toBe(true);
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(screen.getByRole('status')).toHaveTextContent(/^Failed to move file to trash\.$/);
    });

    it('returns focus to the row when the trash request fails from a row-opened menu', async () => {
      mockState.moveToTrash = vi.fn(async () => {
        throw new Error('Request failed');
      });
      const { refreshList } = renderRefreshablePage();
      const row = trashFromRowMenu('/b.txt', 'b.txt');

      await waitFor(() => expect(mockState.moveToTrash).toHaveBeenCalledTimes(1));
      refreshList();

      await waitFor(() => expect(row).toHaveFocus());
      expect(row.isConnected).toBe(true);
    });
  });

  it('renders unauthorized notice for 403', () => {
    mockState.filesError = new ApiError('Not authorized for this account', 403);

    renderPage();

    expect(screen.getByText('UnauthorizedNotice')).toBeInTheDocument();
  });

  it('blocks folder rename when sibling folder with same normalized name exists', async () => {
    mockState.renameFolder = vi.fn(async () => {});
    mockState.tree = { root: [folder('f_docs', 'docs'), folder('f_reports', 'my reports')] };

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for docs' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Folder name'), {
      target: { value: 'my   reports' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(mockState.renameFolder).not.toHaveBeenCalled();
    expect(screen.getByText('A sibling folder with this name already exists.')).toBeInTheDocument();
  });

  it('shows conflict message in dialog when API returns 409 on folder rename', async () => {
    mockState.renameFolder = vi.fn(async () => {
      throw new ApiError('Request failed', 409);
    });
    mockState.tree = { root: [folder('f_docs', 'docs')] };

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for docs' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Folder name'), {
      target: { value: 'docs-archive' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    await waitFor(() => expect(mockState.renameFolder).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText('A sibling folder with this name already exists.')).toBeInTheDocument()
    );
  });

  it('shows progress state while recursively trashing a folder', async () => {
    let resolveMove!: () => void;
    const movePromise = new Promise<void>((resolve) => {
      resolveMove = resolve;
    });
    mockState.moveToTrash = vi.fn(async () => await movePromise);
    mockState.tree = { root: [folder('f_docs', 'docs')] };

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for docs' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to Trash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));

    expect(screen.getByRole('button', { name: 'Moving to trash...' })).toBeDisabled();
    expect(mockState.moveToTrash).toHaveBeenCalledWith({
      fullPath: '/docs',
      targetType: 'folder'
    });

    resolveMove();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Moving to trash...' })).not.toBeInTheDocument()
    );
  });

  it('shows error feedback when recursive folder trash fails', async () => {
    mockState.moveToTrash = vi.fn(async () => {
      throw new Error('Failed to move folder to trash');
    });
    mockState.tree = { root: [folder('f_docs', 'docs')] };

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Actions for docs' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to Trash' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));

    await waitFor(() =>
      expect(screen.getByText('Failed to move folder to trash')).toBeInTheDocument()
    );
  });
  describe('status line after Move to Trash', () => {
    const trashFolderDocs = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Actions for docs' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Move to Trash' }));
      fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));
    };

    const moveFolderDocsToArchive = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Actions for docs' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Move' }));
      const dialog = screen.getByRole('dialog', { name: 'Move folder' });
      fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: '/archive' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Move' }));
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Folder moved from /docs to /archive/docs.')
      );
    };

    beforeEach(() => {
      mockState.tree = {
        root: [folder('f_docs', 'docs'), folder('f_archive', 'archive'), file('f_readme', 'README.md')],
        f_archive: []
      };
      mockState.moveFolder = vi.fn(async () => ({
        status: 'MOVED',
        from: '/docs',
        to: '/archive/docs',
        moved: true
      }));
    });

    it('confirms a successful folder trash in the status region', async () => {
      mockState.moveToTrash = vi.fn(async () => {});

      renderPage();
      // The status region is on the page before any message, so the confirmation is a text change
      // in an existing live region (announced by screen readers), not a newly mounted one.
      const region = screen.getByRole('status');
      expect(region).toBeEmptyDOMElement();
      trashFolderDocs();

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: /trash/i })).not.toBeInTheDocument()
      );
      expect(screen.getByRole('status')).toBe(region);
      expect(region).toHaveTextContent(/^Folder moved to trash\.$/);
    });

    it('replaces a previous move message with the folder trash confirmation', async () => {
      mockState.moveToTrash = vi.fn(async () => {});

      renderPage();
      const region = screen.getByRole('status');
      await moveFolderDocsToArchive();
      trashFolderDocs();

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/^Folder moved to trash\.$/)
      );
      expect(screen.getByRole('status')).toBe(region);
      expect(screen.queryByText(/Folder moved from/)).not.toBeInTheDocument();
    });

    it('claims no success and drops a stale move message when the folder trash fails', async () => {
      mockState.moveToTrash = vi.fn(async () => {
        throw new Error('Failed to move folder to trash');
      });

      renderPage();
      await moveFolderDocsToArchive();
      trashFolderDocs();

      await waitFor(() =>
        expect(screen.getByText('Failed to move folder to trash')).toBeInTheDocument()
      );
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      expect(screen.queryByText(/moved to trash\./)).not.toBeInTheDocument();
      expect(screen.queryByText(/Folder moved from/)).not.toBeInTheDocument();
    });

    it('replaces a previous move message with the file trash confirmation', async () => {
      mockState.moveToTrash = vi.fn(async () => {});

      renderPage();
      const region = screen.getByRole('status');
      await moveFolderDocsToArchive();
      fireEvent.click(screen.getByRole('button', { name: 'Actions for README.md' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Move to Trash' }));

      expect(mockState.moveToTrash).toHaveBeenCalledWith({
        fullPath: '/README.md',
        targetType: 'file'
      });
      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/^File moved to trash\.$/)
      );
      expect(screen.getByRole('status')).toBe(region);
      expect(screen.queryByText(/Folder moved from/)).not.toBeInTheDocument();
    });

    it('reports a failed file trash without claiming success', async () => {
      mockState.moveToTrash = vi.fn(async () => {
        throw new Error('Request failed');
      });

      renderPage();
      await moveFolderDocsToArchive();
      fireEvent.click(screen.getByRole('button', { name: 'Actions for README.md' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Move to Trash' }));

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent(/^Failed to move file to trash\.$/)
      );
      expect(screen.queryByText(/moved to trash\./)).not.toBeInTheDocument();
    });
  });
});
