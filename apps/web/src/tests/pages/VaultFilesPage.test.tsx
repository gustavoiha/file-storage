import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VaultFilesPage } from '@/pages/VaultFilesPage';

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ vaultId: 'v1' }),
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/files/FolderPicker', () => ({
  FolderPicker: () => <div>FolderPicker</div>
}));

vi.mock('@/components/files/UploadForm', () => ({
  UploadForm: () => <div>UploadForm</div>
}));

vi.mock('@/components/files/FileList', () => ({
  FileList: () => <div>FileList</div>
}));

vi.mock('@/hooks/useFiles', () => ({
  useFiles: () => ({ isLoading: false, data: [] }),
  useMoveToTrash: () => ({ mutateAsync: vi.fn(async () => {}) })
}));

describe('VaultFilesPage', () => {
  it('renders vault files page', () => {
    render(<VaultFilesPage />);
    expect(screen.getByText('Vault v1')).toBeInTheDocument();
    expect(screen.getByText('FolderPicker')).toBeInTheDocument();
    expect(screen.getByText('UploadForm')).toBeInTheDocument();
    expect(screen.getByText('FileList')).toBeInTheDocument();
  });
});
