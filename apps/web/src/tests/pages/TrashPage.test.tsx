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

  it('shows the restore error in the failed row, naming that copy by path and trashed time', async () => {
    restoreFileMock.mockRejectedValue(
      new Error('Cannot restore because a file with this name already exists in the folder')
    );
    render(<TrashPage />);

    fireEvent.click(screen.getByRole('button', { name: `Restore ${olderName}` }));

    const [olderRow, newerRow] = screen.getAllByRole('listitem');
    expect(await within(olderRow!).findByRole('alert')).toHaveTextContent(
      `Could not restore /docs/report.txt (trashed ${formatDateTime(olderCopy.deletedAt)}): ` +
        'Cannot restore because a file with this name already exists in the folder'
    );
    expect(within(newerRow!).queryByRole('alert')).toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('button', { name: `Restore ${olderName}` })).toBeEnabled();
  });

  it('keeps an earlier failure when another row is restored, and shows every failure', async () => {
    const newerRestore = deferred();
    restoreFileMock.mockImplementation(async (target) => {
      if (target.fileNodeId === 'file-old') {
        throw new Error('Old copy failed');
      }
      await newerRestore.promise;
    });
    render(<TrashPage />);

    fireEvent.click(screen.getByRole('button', { name: `Restore ${olderName}` }));
    const [olderRow, newerRow] = screen.getAllByRole('listitem');
    expect(await within(olderRow!).findByRole('alert')).toHaveTextContent('Old copy failed');

    fireEvent.click(screen.getByRole('button', { name: `Restore ${newerName}` }));
    expect(screen.getByRole('button', { name: `Restoring... ${newerName}` })).toBeDisabled();
    expect(within(olderRow!).getByRole('alert')).toHaveTextContent('Old copy failed');

    await act(async () => {
      newerRestore.reject(new Error('New copy failed'));
      await newerRestore.promise.catch(() => {});
    });

    expect(within(olderRow!).getByRole('alert')).toHaveTextContent(
      `Could not restore /docs/report.txt (trashed ${formatDateTime(olderCopy.deletedAt)}): Old copy failed`
    );
    expect(within(newerRow!).getByRole('alert')).toHaveTextContent(
      `Could not restore /docs/report.txt (trashed ${formatDateTime(newerCopy.deletedAt)}): New copy failed`
    );
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });

  it('clears a row error when that row is retried', async () => {
    restoreFileMock.mockRejectedValueOnce(new Error('Old copy failed'));
    const retry = deferred();
    restoreFileMock.mockImplementationOnce(() => retry.promise);
    render(<TrashPage />);

    fireEvent.click(screen.getByRole('button', { name: `Restore ${olderName}` }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Old copy failed');

    fireEvent.click(screen.getByRole('button', { name: `Restore ${olderName}` }));
    expect(screen.queryByRole('alert')).toBeNull();

    await act(async () => {
      retry.resolve();
      await retry.promise;
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears a row error when the user dismisses it, leaving other rows errors', async () => {
    restoreFileMock.mockImplementation(async (target) => {
      throw new Error(`${target.fileNodeId} failed`);
    });
    render(<TrashPage />);

    fireEvent.click(screen.getByRole('button', { name: `Restore ${olderName}` }));
    fireEvent.click(screen.getByRole('button', { name: `Restore ${newerName}` }));
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: `Dismiss error for ${olderName}` }));

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('file-new failed');
    expect(screen.queryByRole('button', { name: `Dismiss error for ${olderName}` })).toBeNull();
  });

  it('drops a row error once that copy leaves the trash, and does not bring it back if trashed again', async () => {
    restoreFileMock.mockRejectedValue(new Error('Old copy failed'));
    const { rerender } = render(<TrashPage />);

    fireEvent.click(screen.getByRole('button', { name: `Restore ${olderName}` }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Old copy failed');

    trashState.items = [newerCopy];
    rerender(<TrashPage />);
    expect(screen.queryByRole('alert')).toBeNull();

    trashState.items = [{ ...olderCopy, deletedAt: '2026-03-10T09:00:00.000Z' }, newerCopy];
    rerender(<TrashPage />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('scrolls a new restore error into view', async () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      restoreFileMock.mockRejectedValue(new Error('New copy failed'));
      render(<TrashPage />);

      fireEvent.click(screen.getByRole('button', { name: `Restore ${newerName}` }));
      const alert = await screen.findByRole('alert');

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      expect(scrollIntoView.mock.contexts.at(-1)).toContainElement(alert);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
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
