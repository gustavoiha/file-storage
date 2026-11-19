import type { ReactElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(within(preview).getByRole('heading', { name: 'IMG_4821.jpg' })).toBeInTheDocument();
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
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
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
});
