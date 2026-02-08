import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrashPage } from '@/pages/TrashPage';

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ vaultId: 'v1' }),
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/files/FileList', () => ({
  FileList: () => <div>FileList</div>
}));

vi.mock('@/hooks/useFiles', () => ({
  useTrash: () => ({ isLoading: false, data: [] }),
  useRestoreFile: () => ({ mutateAsync: vi.fn(async () => {}) })
}));

describe('TrashPage', () => {
  it('renders trash page', () => {
    render(<TrashPage />);
    expect(screen.getByText('Trash')).toBeInTheDocument();
    expect(screen.getByText('FileList')).toBeInTheDocument();
  });
});
