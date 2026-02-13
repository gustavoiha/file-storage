import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/apiClient';
import { DockspaceFilesPage } from '@/pages/DockspaceFilesPage';

const mockState = vi.hoisted(() => ({
  filesResult: {
    isLoading: false,
    data: {
      parentFolderNodeId: 'root',
      items: []
    } as unknown,
    error: null as unknown
  },
  moveToTrash: vi.fn(async () => {}),
  renameFile: vi.fn(async () => {}),
  renameFolder: vi.fn(async () => {})
}));

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ dockspaceId: 'v1' }),
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/auth/UnauthorizedNotice', () => ({
  UnauthorizedNotice: () => <div>UnauthorizedNotice</div>
}));

vi.mock('@/components/files/FileList', () => ({
  FileList: ({
    toolbarActions,
    onRenameFolder,
    onActionFolder
  }: {
    toolbarActions?: unknown;
    onRenameFolder?: (folderPath: string) => void;
    onActionFolder?: (folderPath: string) => void;
  }) => (
    <div>
      {toolbarActions as any}
      {onRenameFolder ? (
        <button type="button" onClick={() => onRenameFolder('/docs')}>
          Open rename folder
        </button>
      ) : null}
      {onActionFolder ? (
        <button type="button" onClick={() => onActionFolder('/docs')}>
          Open trash folder
        </button>
      ) : null}
      FileList
    </div>
  )
}));

vi.mock('@/hooks/useFiles', () => ({
  useFiles: () => mockState.filesResult,
  useMoveToTrash: () => ({ mutateAsync: mockState.moveToTrash }),
  useRenameFile: () => ({ mutateAsync: mockState.renameFile, isPending: false, error: null }),
  useRenameFolder: () => ({ mutateAsync: mockState.renameFolder, isPending: false, error: null }),
  useCreateFolder: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false, error: null }),
  useUploadFile: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false, error: null })
}));

vi.mock('@/hooks/useDockspaces', () => ({
  useDockspaces: () => ({
    data: [
      {
        dockspaceId: 'v1',
        name: 'My Dockspace'
      }
    ]
  })
}));

afterEach(() => {
  cleanup();
});

describe('DockspaceFilesPage', () => {
  it('renders dockspace files page', () => {
    mockState.filesResult = {
      isLoading: false,
      data: {
        parentFolderNodeId: 'root',
        items: []
      },
      error: null
    };

    render(<DockspaceFilesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Dockspace options' }));
    expect(screen.getByRole('menuitem', { name: 'Create folder' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Upload files' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Upload folder' })).toBeInTheDocument();
    expect(screen.getByText('Trash')).toBeInTheDocument();
    expect(screen.getByText('FileList')).toBeInTheDocument();
  });

  it('renders unauthorized notice for 403', () => {
    mockState.filesResult = {
      isLoading: false,
      data: {
        parentFolderNodeId: 'root',
        items: []
      },
      error: new ApiError('Not authorized for this account', 403)
    };

    render(<DockspaceFilesPage />);

    expect(screen.getByText('UnauthorizedNotice')).toBeInTheDocument();
  });

  it('blocks folder rename when sibling folder with same normalized name exists', async () => {
    mockState.renameFolder = vi.fn(async () => {});
    mockState.filesResult = {
      isLoading: false,
      data: {
        parentFolderNodeId: 'root',
        items: [
          {
            parentFolderNodeId: 'root',
            childId: 'f_docs',
            childType: 'folder',
            name: 'docs',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z'
          },
          {
            parentFolderNodeId: 'root',
            childId: 'f_reports',
            childType: 'folder',
            name: 'my reports',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z'
          }
        ]
      },
      error: null
    };

    render(<DockspaceFilesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Open rename folder' }));
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
    mockState.filesResult = {
      isLoading: false,
      data: {
        parentFolderNodeId: 'root',
        items: [
          {
            parentFolderNodeId: 'root',
            childId: 'f_docs',
            childType: 'folder',
            name: 'docs',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z'
          }
        ]
      },
      error: null
    };

    render(<DockspaceFilesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Open rename folder' }));
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
    mockState.filesResult = {
      isLoading: false,
      data: {
        parentFolderNodeId: 'root',
        items: []
      },
      error: null
    };

    render(<DockspaceFilesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Open trash folder' }));
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
    mockState.filesResult = {
      isLoading: false,
      data: {
        parentFolderNodeId: 'root',
        items: []
      },
      error: null
    };

    render(<DockspaceFilesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Open trash folder' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));

    await waitFor(() =>
      expect(screen.getByText('Failed to move folder to trash')).toBeInTheDocument()
    );
  });
});
