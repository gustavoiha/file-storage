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

vi.mock('@/hooks/useFiles', () => {
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
    useFiles: (_dockspaceId: string, folderNodeId: string) => resultFor(folderNodeId),
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
