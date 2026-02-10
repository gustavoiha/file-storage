import { render, screen } from '@testing-library/react';
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
  moveToTrash: vi.fn(async () => {})
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

vi.mock('@/components/files/UploadForm', () => ({
  UploadForm: () => <div>UploadForm</div>
}));

vi.mock('@/components/files/FileList', () => ({
  FileList: () => <div>FileList</div>
}));

vi.mock('@/hooks/useFiles', () => ({
  useFiles: () => mockState.filesResult,
  useMoveToTrash: () => ({ mutateAsync: mockState.moveToTrash }),
  useCreateFolder: () => ({ mutateAsync: vi.fn(async () => ({})) })
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
    expect(screen.getByText('Vault v1')).toBeInTheDocument();
    expect(screen.getByText('UploadForm')).toBeInTheDocument();
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
