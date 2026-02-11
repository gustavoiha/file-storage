import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/apiClient';
import { VaultFilesPage } from '@/pages/VaultFilesPage';

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
  renameFile: vi.fn(async () => {})
}));

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ vaultId: 'v1' }),
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/auth/UnauthorizedNotice', () => ({
  UnauthorizedNotice: () => <div>UnauthorizedNotice</div>
}));

vi.mock('@/components/files/FileList', () => ({
  FileList: ({ toolbarActions }: { toolbarActions?: unknown }) => (
    <div>
      {toolbarActions as any}
      FileList
    </div>
  )
}));

vi.mock('@/hooks/useFiles', () => ({
  useFiles: () => mockState.filesResult,
  useMoveToTrash: () => ({ mutateAsync: mockState.moveToTrash }),
  useRenameFile: () => ({ mutateAsync: mockState.renameFile, isPending: false, error: null }),
  useCreateFolder: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false, error: null }),
  useUploadFile: () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false, error: null })
}));

vi.mock('@/hooks/useVaults', () => ({
  useVaults: () => ({
    data: [
      {
        vaultId: 'v1',
        name: 'My Vault'
      }
    ]
  })
}));

describe('VaultFilesPage', () => {
  it('renders vault files page', () => {
    mockState.filesResult = {
      isLoading: false,
      data: {
        parentFolderNodeId: 'root',
        items: []
      },
      error: null
    };

    render(<VaultFilesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Vault options' }));
    expect(screen.getByRole('menuitem', { name: 'Create folder' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Upload files' })).toBeInTheDocument();
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

    render(<VaultFilesPage />);

    expect(screen.getByText('UnauthorizedNotice')).toBeInTheDocument();
  });
});
