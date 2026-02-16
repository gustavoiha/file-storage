import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrashPage } from '@/pages/TrashPage';

const { restoreFileNowMock, purgeFileNowMock } = vi.hoisted(() => ({
  restoreFileNowMock: vi.fn(async () => {}),
  purgeFileNowMock: vi.fn(async () => ({
    fullPath: '/docs/report.txt',
    state: 'PURGED' as const,
    purgedAt: '2026-02-17T00:00:00.000Z'
  }))
}));

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ dockspaceId: 'v1' }),
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/files/FileList', () => ({
  FileList: ({
    onAction,
    onSecondaryAction
  }: {
    onAction?: (fullPath: string) => void;
    onSecondaryAction?: (fullPath: string) => void;
  }) => (
    <div>
      <div>FileList</div>
      {onAction ? (
        <button type="button" onClick={() => onAction('/docs/report.txt')}>
          Restore file
        </button>
      ) : null}
      {onSecondaryAction ? (
        <button type="button" onClick={() => onSecondaryAction('/docs/report.txt')}>
          Purge file
        </button>
      ) : null}
    </div>
  )
}));

vi.mock('@/hooks/useFiles', () => ({
  useTrash: () => ({ isLoading: false, data: [] }),
  useRestoreFile: () => ({ mutateAsync: restoreFileNowMock }),
  usePurgeFileNow: () => ({ mutateAsync: purgeFileNowMock, isPending: false })
}));

describe('TrashPage', () => {
  beforeEach(() => {
    restoreFileNowMock.mockClear();
    purgeFileNowMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('restores a file from trash', async () => {
    render(<TrashPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore file' }));
    await waitFor(() => expect(restoreFileNowMock).toHaveBeenCalledWith('/docs/report.txt'));
  });

  it('opens purge dialog and purges file after confirmation', async () => {
    render(<TrashPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Purge file' }));
    expect(screen.getByText('Purge file now')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Purge now' }));
    await waitFor(() => expect(purgeFileNowMock).toHaveBeenCalledWith('/docs/report.txt'));
  });

  it('renders trash page', () => {
    render(<TrashPage />);
    expect(screen.getByText('Trash')).toBeInTheDocument();
    expect(screen.getByText('FileList')).toBeInTheDocument();
  });
});
