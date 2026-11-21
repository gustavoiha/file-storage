import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrashPage } from '@/pages/TrashPage';
import type { FileRecord } from '@/lib/apiTypes';
import type { TrashedFileTarget } from '@/lib/dockspaceApi';
import { formatDateTime } from '@/lib/fileFormat';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

const deferred = (): Deferred => {
  let resolve: () => void = () => {};
  let reject: (error: Error) => void = () => {};
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const { trashState, restoreFileMock, purgeFileNowMock } = vi.hoisted(() => ({
  trashState: { items: [] as FileRecord[] },
  restoreFileMock: vi.fn<(target: TrashedFileTarget) => Promise<void>>(async () => {}),
  purgeFileNowMock: vi.fn<(target: TrashedFileTarget) => Promise<void>>(async () => {})
}));

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ dockspaceId: 'v1' }),
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/hooks/useFiles', async () => {
  const React = await import('react');
  // Mirrors react-query: isPending is true while the mutation runs, and a successful purge
  // removes the purged copy from the trash list before mutateAsync resolves.
  const useMutationMock = (
    fn: (target: TrashedFileTarget) => Promise<void>,
    onSuccess?: (target: TrashedFileTarget) => void
  ) => {
    const [isPending, setIsPending] = React.useState(false);
    return {
      isPending,
      mutateAsync: async (target: TrashedFileTarget) => {
        setIsPending(true);
        try {
          await fn(target);
          onSuccess?.(target);
        } finally {
          setIsPending(false);
        }
      }
    };
  };

  return {
    useTrash: () => ({ isLoading: false, data: trashState.items }),
    useRestoreFile: () => useMutationMock(restoreFileMock),
    usePurgeFileNow: () =>
      useMutationMock(purgeFileNowMock, (target) => {
        trashState.items = trashState.items.filter(
          (item) => item.fileNodeId !== target.fileNodeId
        );
      })
  };
});

const olderCopy: FileRecord = {
  fileNodeId: 'file-old',
  fullPath: '/docs/report.txt',
  size: 10,
  deletedAt: '2026-01-10T09:00:00.000Z',
  state: 'TRASH'
};
const newerCopy: FileRecord = {
  fileNodeId: 'file-new',
  fullPath: '/docs/report.txt',
  size: 20,
  deletedAt: '2026-02-10T09:00:00.000Z',
  state: 'TRASH'
};
const olderName = `/docs/report.txt, trashed ${formatDateTime(olderCopy.deletedAt)}`;
const newerName = `/docs/report.txt, trashed ${formatDateTime(newerCopy.deletedAt)}`;

describe('TrashPage', () => {
  beforeEach(() => {
    trashState.items = [olderCopy, newerCopy];
    restoreFileMock.mockReset();
    restoreFileMock.mockImplementation(async () => {});
    purgeFileNowMock.mockReset();
    purgeFileNowMock.mockImplementation(async () => {});
  });

  afterEach(() => {
    cleanup();
  });

  it('renders trash page', () => {
    render(<TrashPage />);
    expect(screen.getByText('Trash')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('restores only the picked copy and shows Restoring... on that row alone', async () => {
    const restore = deferred();
    restoreFileMock.mockImplementation(() => restore.promise);
    render(<TrashPage />);

    fireEvent.click(screen.getByRole('button', { name: `Restore ${newerName}` }));

    expect(restoreFileMock).toHaveBeenCalledTimes(1);
    expect(restoreFileMock).toHaveBeenCalledWith({
      fullPath: '/docs/report.txt',
      fileNodeId: 'file-new'
    });
    expect(screen.getByRole('button', { name: `Restoring... ${newerName}` })).toBeDisabled();
    expect(screen.getByRole('button', { name: `Restore ${olderName}` })).toBeEnabled();

    await act(async () => {
      restore.resolve();
      await restore.promise;
    });
    expect(screen.getByRole('button', { name: `Restore ${newerName}` })).toBeEnabled();
  });

  it('shows the restore error when the restore fails', async () => {
    restoreFileMock.mockRejectedValue(
      new Error('Cannot restore because a file with this name already exists in the folder')
    );
    render(<TrashPage />);

    fireEvent.click(screen.getByRole('button', { name: `Restore ${olderName}` }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot restore because a file with this name already exists in the folder'
    );
    expect(screen.getByRole('button', { name: `Restore ${olderName}` })).toBeEnabled();
  });

  it('purges only the picked copy, shows Purging... on that row alone, then closes the dialog', async () => {
    const purge = deferred();
    purgeFileNowMock.mockImplementation(() => purge.promise);
    const { rerender } = render(<TrashPage />);

    fireEvent.click(screen.getByRole('button', { name: `Purge now ${olderName}` }));
    const dialog = screen.getByRole('dialog', { name: 'Purge file now' });
    expect(dialog).toHaveTextContent(`(trashed ${formatDateTime(olderCopy.deletedAt)})`);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Purge now' }));

    expect(purgeFileNowMock).toHaveBeenCalledTimes(1);
    expect(purgeFileNowMock).toHaveBeenCalledWith({
      fullPath: '/docs/report.txt',
      fileNodeId: 'file-old'
    });
    expect(screen.getByRole('button', { name: `Purging... ${olderName}` })).toBeDisabled();
    expect(screen.getByRole('button', { name: `Purge now ${newerName}` })).toBeEnabled();
    expect(screen.queryByRole('button', { name: `Purging... ${newerName}` })).toBeNull();

    await act(async () => {
      purge.resolve();
      await purge.promise;
    });
    rerender(<TrashPage />);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('button', { name: `Purge now ${newerName}` })).toBeEnabled();
    expect(screen.queryByRole('button', { name: `Purge now ${olderName}` })).toBeNull();
  });

  it('keeps the dialog open with the error after a failed purge, and lets it close', async () => {
    purgeFileNowMock.mockRejectedValue(new Error('Could not fully purge object versions from S3'));
    render(<TrashPage />);

    fireEvent.click(screen.getByRole('button', { name: `Purge now ${newerName}` }));
    const dialog = screen.getByRole('dialog', { name: 'Purge file now' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Purge now' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not fully purge object versions from S3'
    );
    expect(screen.getByRole('button', { name: `Purge now ${newerName}` })).toBeEnabled();
    expect(screen.getByRole('button', { name: `Purge now ${olderName}` })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
