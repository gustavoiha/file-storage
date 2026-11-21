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
  // refetchBeforePurgeResolves: false models the trash refetch landing after the dialog closed.
  trashState: { items: [] as FileRecord[], refetchBeforePurgeResolves: true },
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
  // removes the purged copy from the trash list before mutateAsync resolves (unless a test
  // sets trashState.refetchBeforePurgeResolves = false and removes it itself, later).
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
        if (!trashState.refetchBeforePurgeResolves) {
          return;
        }
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
    trashState.refetchBeforePurgeResolves = true;
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

  it('moves focus to that row\'s Restore button when its error is dismissed', async () => {
    restoreFileMock.mockImplementation(async (target) => {
      throw new Error(`${target.fileNodeId} failed`);
    });
    render(<TrashPage />);

    fireEvent.click(screen.getByRole('button', { name: `Restore ${olderName}` }));
    fireEvent.click(screen.getByRole('button', { name: `Restore ${newerName}` }));
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));

    const dismissOlder = screen.getByRole('button', { name: `Dismiss error for ${olderName}` });
    dismissOlder.focus();
    expect(document.activeElement).toBe(dismissOlder);
    fireEvent.click(dismissOlder);

    expect(screen.queryByRole('button', { name: `Dismiss error for ${olderName}` })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: `Restore ${olderName}` })
    );
    expect(document.activeElement).not.toBe(document.body);
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

  it('moves focus to Cancel after a failed purge', async () => {
    const purge = deferred();
    purgeFileNowMock.mockImplementation(() => purge.promise);
    render(<TrashPage />);

    fireEvent.click(screen.getByRole('button', { name: `Purge now ${newerName}` }));
    const dialog = screen.getByRole('dialog', { name: 'Purge file now' });
    const confirm = within(dialog).getByRole('button', { name: 'Purge now' });
    confirm.focus();
    fireEvent.click(confirm);
    expect(within(dialog).getByRole('button', { name: 'Purging...' })).toBeDisabled();
    // A browser moves focus to body when the focused button is disabled; jsdom keeps it.
    const placeholder = document.createElement('input');
    document.body.append(placeholder);
    placeholder.focus();
    placeholder.remove();

    await act(async () => {
      purge.reject(new Error('Could not fully purge object versions from S3'));
      await purge.promise.catch(() => {});
    });

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Could not fully purge object versions from S3'
    );
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
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

  describe('focus after a row leaves the trash', () => {
    const trashedFile = (name: string, day: number): FileRecord => ({
      fileNodeId: `file-${name}`,
      fullPath: `/docs/${name}.txt`,
      size: 10,
      deletedAt: `2026-01-${String(day).padStart(2, '0')}T09:00:00.000Z`,
      state: 'TRASH'
    });
    const first = trashedFile('first', 1);
    const middle = trashedFile('middle', 2);
    const last = trashedFile('last', 3);
    const rowName = (file: FileRecord) =>
      `${file.fullPath}, trashed ${formatDateTime(file.deletedAt)}`;
    const restoreButton = (file: FileRecord) =>
      screen.getByRole('button', { name: `Restore ${rowName(file)}` });
    const purgeButton = (file: FileRecord) =>
      screen.getByRole('button', { name: `Purge now ${rowName(file)}` });
    // Mirrors react-query: the trash refetch lands before mutateAsync resolves.
    const removeFromTrash = async (target: TrashedFileTarget) => {
      trashState.items = trashState.items.filter((item) => item.fileNodeId !== target.fileNodeId);
    };

    /** Keyboard user: focus the control, then activate it. */
    const press = (element: HTMLElement) => {
      element.focus();
      expect(document.activeElement).toBe(element);
      fireEvent.click(element);
    };

    /** Lets the dialog's own focus restore (a timeout after it closes) run too. */
    const flushDialogFocusRestore = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

    beforeEach(() => {
      trashState.items = [first, middle, last];
    });

    it('moves focus to the next row\'s Restore button after restoring a middle row', async () => {
      restoreFileMock.mockImplementation(removeFromTrash);
      render(<TrashPage />);

      press(restoreButton(middle));

      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
      expect(document.activeElement).toBe(restoreButton(last));
    });

    it('moves focus to the previous row\'s Restore button after restoring the last row', async () => {
      restoreFileMock.mockImplementation(removeFromTrash);
      render(<TrashPage />);

      press(restoreButton(last));

      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
      expect(document.activeElement).toBe(restoreButton(middle));
    });

    it('moves focus to the empty-trash message after restoring the only row', async () => {
      trashState.items = [middle];
      restoreFileMock.mockImplementation(removeFromTrash);
      render(<TrashPage />);

      press(restoreButton(middle));

      const emptyMessage = await screen.findByText('No files found.');
      expect(document.activeElement).toBe(emptyMessage);
      expect(emptyMessage).toHaveAttribute('tabindex', '-1');
      expect(emptyMessage).toHaveClass('flat-file-list__empty');
    });

    it('skips a row whose Restore is in progress and falls back to the list when none is left', async () => {
      trashState.items = [middle, last];
      const lastRestore = deferred();
      restoreFileMock.mockImplementation(async (target) => {
        if (target.fileNodeId === last.fileNodeId) {
          await lastRestore.promise;
          return;
        }
        await removeFromTrash(target);
      });
      render(<TrashPage />);

      fireEvent.click(restoreButton(last));
      expect(screen.getByRole('button', { name: `Restoring... ${rowName(last)}` })).toBeDisabled();
      press(restoreButton(middle));

      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
      const list = screen.getByRole('list');
      expect(document.activeElement).toBe(list);
      expect(list).toHaveAttribute('tabindex', '-1');
      expect(list).toHaveClass('flat-file-list');

      await act(async () => {
        lastRestore.resolve();
        await lastRestore.promise;
      });
    });

    it('moves focus once the row leaves the list, when the list updates after the restore resolves', async () => {
      const restore = deferred();
      restoreFileMock.mockImplementation(() => restore.promise);
      const { rerender } = render(<TrashPage />);

      press(restoreButton(middle));
      await act(async () => {
        restore.resolve();
        await restore.promise;
      });
      // The row is still listed: focus stays where it is.
      expect(document.activeElement).toBe(restoreButton(middle));

      trashState.items = [first, last];
      rerender(<TrashPage />);
      expect(document.activeElement).toBe(restoreButton(last));
    });

    it('leaves focus alone when the user moved it elsewhere while the restore ran', async () => {
      const restore = deferred();
      restoreFileMock.mockImplementation(async (target) => {
        await restore.promise;
        await removeFromTrash(target);
      });
      render(<TrashPage />);

      press(restoreButton(middle));
      const elsewhere = purgeButton(first);
      elsewhere.focus();
      await act(async () => {
        restore.resolve();
        await restore.promise;
      });

      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
      expect(document.activeElement).toBe(elsewhere);
    });

    describe('when the disabled Restore button drops focus to <body>', () => {
      /**
       * Browsers move focus from a button to <body> when it becomes disabled; jsdom keeps it there.
       * Blur the focused element whenever it gains `disabled`, as the browser does. jsdom ignores
       * blur() on a disabled element, so enable it for the blur.
       */
      let blurOnDisable: MutationObserver | undefined;

      beforeEach(() => {
        blurOnDisable = new MutationObserver(() => {
          const active = document.activeElement;
          if (active instanceof HTMLButtonElement && active.disabled) {
            active.disabled = false;
            active.blur();
            active.disabled = true;
          }
        });
        blurOnDisable.observe(document.body, {
          attributes: true,
          attributeFilter: ['disabled'],
          subtree: true
        });
      });

      afterEach(() => {
        blurOnDisable?.disconnect();
      });

      it('puts focus back on the row\'s Restore button when the disabled button dropped it', async () => {
        const restore = deferred();
        restoreFileMock.mockImplementation(() => restore.promise);
        render(<TrashPage />);

        press(restoreButton(middle));
        expect(screen.getByRole('button', { name: `Restoring... ${rowName(middle)}` })).toBeDisabled();
        await waitFor(() => expect(document.activeElement).toBe(document.body));

        await act(async () => {
          restore.reject(new Error('Restore failed'));
          await restore.promise.catch(() => {});
        });

        expect(screen.getByRole('alert')).toHaveTextContent('Restore failed');
        expect(screen.getAllByRole('listitem')).toHaveLength(3);
        expect(document.activeElement).toBe(restoreButton(middle));
      });

      it('leaves focus alone when the user moved it elsewhere while the restore ran', async () => {
        const restore = deferred();
        restoreFileMock.mockImplementation(() => restore.promise);
        render(<TrashPage />);

        press(restoreButton(middle));
        await waitFor(() => expect(document.activeElement).toBe(document.body));
        const elsewhere = purgeButton(first);
        elsewhere.focus();

        await act(async () => {
          restore.reject(new Error('Restore failed'));
          await restore.promise.catch(() => {});
        });

        expect(screen.getByRole('alert')).toHaveTextContent('Restore failed');
        expect(document.activeElement).toBe(elsewhere);
      });

      it('puts focus back on the failed row only, while another row\'s restore still runs', async () => {
        const middleRestore = deferred();
        const lastRestore = deferred();
        restoreFileMock.mockImplementation((target) =>
          target.fileNodeId === middle.fileNodeId ? middleRestore.promise : lastRestore.promise
        );
        render(<TrashPage />);

        press(restoreButton(last));
        press(restoreButton(middle));
        await waitFor(() => expect(document.activeElement).toBe(document.body));

        await act(async () => {
          middleRestore.reject(new Error('Middle failed'));
          await middleRestore.promise.catch(() => {});
        });

        expect(screen.getByRole('alert')).toHaveTextContent('Middle failed');
        expect(screen.getByRole('button', { name: `Restoring... ${rowName(last)}` })).toBeDisabled();
        expect(document.activeElement).toBe(restoreButton(middle));

        await act(async () => {
          lastRestore.resolve();
          await lastRestore.promise;
        });
        expect(document.activeElement).toBe(restoreButton(middle));
      });

      it('still moves focus to the next row\'s Restore button after a successful restore', async () => {
        const restore = deferred();
        restoreFileMock.mockImplementation(async (target) => {
          await restore.promise;
          await removeFromTrash(target);
        });
        render(<TrashPage />);

        press(restoreButton(middle));
        await waitFor(() => expect(document.activeElement).toBe(document.body));

        await act(async () => {
          restore.resolve();
          await restore.promise;
        });

        await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
        expect(document.activeElement).toBe(restoreButton(last));
      });

      it('returns focus to the Restore button when the error is dismissed', async () => {
        restoreFileMock.mockRejectedValue(new Error('Restore failed'));
        render(<TrashPage />);

        press(restoreButton(middle));
        expect(await screen.findByRole('alert')).toHaveTextContent('Restore failed');
        await waitFor(() => expect(document.activeElement).toBe(restoreButton(middle)));

        press(screen.getByRole('button', { name: `Dismiss error for ${rowName(middle)}` }));

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(document.activeElement).toBe(restoreButton(middle));
      });
    });

    it('moves focus to the next row\'s Restore button once the dialog closes after a purge', async () => {
      render(<TrashPage />);

      press(purgeButton(middle));
      const dialog = screen.getByRole('dialog', { name: 'Purge file now' });
      press(within(dialog).getByRole('button', { name: 'Purge now' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      expect(document.activeElement).toBe(restoreButton(last));

      await flushDialogFocusRestore();
      expect(document.activeElement).toBe(restoreButton(last));
    });

    it('moves focus once the row leaves the list, when the list updates after the purge dialog closed', async () => {
      trashState.refetchBeforePurgeResolves = false;
      const { rerender } = render(<TrashPage />);

      const opener = purgeButton(middle);
      press(opener);
      press(
        within(screen.getByRole('dialog', { name: 'Purge file now' })).getByRole('button', {
          name: 'Purge now'
        })
      );

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await flushDialogFocusRestore();
      // The row is still listed: the dialog hands focus back to its opener.
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
      expect(document.activeElement).toBe(opener);

      trashState.items = [first, last];
      rerender(<TrashPage />);
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      expect(document.activeElement).toBe(restoreButton(last));

      await flushDialogFocusRestore();
      expect(document.activeElement).toBe(restoreButton(last));
    });

    it('moves focus to the previous row\'s Restore button after purging the last row', async () => {
      render(<TrashPage />);

      press(purgeButton(last));
      press(
        within(screen.getByRole('dialog', { name: 'Purge file now' })).getByRole('button', {
          name: 'Purge now'
        })
      );

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await flushDialogFocusRestore();
      expect(document.activeElement).toBe(restoreButton(middle));
    });

    it('moves focus to the empty-trash message after purging the only row', async () => {
      trashState.items = [middle];
      render(<TrashPage />);

      press(purgeButton(middle));
      press(
        within(screen.getByRole('dialog', { name: 'Purge file now' })).getByRole('button', {
          name: 'Purge now'
        })
      );

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await flushDialogFocusRestore();
      expect(document.activeElement).toBe(screen.getByText('No files found.'));
    });

    it('returns focus to the Purge button when the dialog is cancelled after a failed purge', async () => {
      purgeFileNowMock.mockRejectedValue(new Error('Purge failed'));
      render(<TrashPage />);

      const opener = purgeButton(middle);
      press(opener);
      const dialog = screen.getByRole('dialog', { name: 'Purge file now' });
      press(within(dialog).getByRole('button', { name: 'Purge now' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Purge failed');

      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await flushDialogFocusRestore();
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
      expect(document.activeElement).toBe(opener);
    });
  });
});
