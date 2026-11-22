import { act, renderHook, waitFor } from '@testing-library/react';
import type { InfiniteData } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCreateFolder,
  useDiscoverFolder,
  useFiles,
  useMoveFiles,
  useMoveToTrash,
  usePurgeFileNow,
  useRenameFile,
  useRenameFolder,
  useRestoreFile,
  useTrashFilesBatch,
  useUploadFile
} from '@/hooks/useFiles';
import { useMediaFiles } from '@/hooks/useMedia';
import type { MediaFileRecord, MediaListResponse } from '@/lib/apiTypes';
import { clearSession, setSession } from '@/lib/authStore';
import { createTestQueryClient, QueryWrapper } from '@/tests/testUtils';

const {
  listFolderChildren,
  createFolder,
  uploadFile,
  moveFiles,
  moveToTrash,
  purgeFileNow,
  renameFile,
  renameFolder,
  restoreFile,
  listMedia
} = vi.hoisted(() => ({
  listFolderChildren: vi.fn(async () => ({
    parentFolderNodeId: 'root',
    items: [
      {
        childId: 'file_1',
        childType: 'file',
        name: 'x.txt',
        normalizedName: 'x.txt',
        parentFolderNodeId: 'root',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    ]
  })),
  createFolder: vi.fn(async () => ({
    folderPath: '/docs',
    folderNodeId: 'folder_1',
    created: true
  })),
  uploadFile: vi.fn(async () => {}),
  moveFiles: vi.fn(async () => ({ moved: [], failed: [] })),
  moveToTrash: vi.fn(async (_dockspaceId: string, _params: { fullPath: string; targetType?: string }) => {}),
  purgeFileNow: vi.fn(async () => ({
    fullPath: '/x.txt',
    state: 'PURGED' as const,
    purgedAt: '2026-02-17T00:00:00.000Z'
  })),
  renameFile: vi.fn(async () => {}),
  renameFolder: vi.fn(async () => {}),
  restoreFile: vi.fn(async () => {}),
  listMedia: vi.fn()
}));

vi.mock('@/lib/dockspaceApi', () => ({
  listFolderChildren,
  listTrash: vi.fn(async () => []),
  listPurged: vi.fn(async () => []),
  createFolder,
  uploadFile,
  moveFiles,
  moveToTrash,
  purgeFileNow,
  renameFile,
  renameFolder,
  restoreFile,
  listMedia
}));

beforeEach(() => {
  setSession({
    accessToken: 'a',
    idToken: 'i',
    email: 'a@a.com',
    userId: 'u1'
  });
});

afterEach(() => {
  clearSession();
});

describe('useFiles', () => {
  it('loads files', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useFiles('v1', 'root'), {
      wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items[0]?.name).toBe('x.txt');
  });

  it('uploads file', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useUploadFile('v1', '/'), {
      wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
    });

    const file = new File(['x'], 'x.txt');
    await result.current.mutateAsync({ fullPath: '/x.txt', file });

    expect(uploadFile).toHaveBeenCalledWith('v1', '/x.txt', file);
  });

  it('moves file to trash', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useMoveToTrash('v1', '/'), {
      wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
    });

    await result.current.mutateAsync({ fullPath: '/x.txt', targetType: 'file' });
    expect(moveToTrash).toHaveBeenCalledWith('v1', { fullPath: '/x.txt', targetType: 'file' });
  });

  it('purges trashed file immediately', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => usePurgeFileNow('v1'), {
      wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
    });

    await result.current.mutateAsync({ fullPath: '/x.txt', fileNodeId: 'file-2' });
    expect(purgeFileNow).toHaveBeenCalledWith('v1', { fullPath: '/x.txt', fileNodeId: 'file-2' });
  });

  it('restores the trashed file named by its file node id', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useRestoreFile('v1'), {
      wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
    });

    await result.current.mutateAsync({ fullPath: '/x.txt', fileNodeId: 'file-1' });
    expect(restoreFile).toHaveBeenCalledWith('v1', { fullPath: '/x.txt', fileNodeId: 'file-1' });
  });

  it('moves multiple files to a folder', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useMoveFiles('v1', '/'), {
      wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
    });

    await result.current.mutateAsync({
      sourcePaths: ['/x.txt', '/y.txt'],
      targetFolderPath: '/docs'
    });

    expect(moveFiles).toHaveBeenCalledWith('v1', {
      sourcePaths: ['/x.txt', '/y.txt'],
      targetFolderPath: '/docs'
    });
  });

  it('discovers folder children', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useDiscoverFolder('v1'), {
      wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
    });

    await result.current.mutateAsync('root');
    expect(listFolderChildren).toHaveBeenCalledWith('v1', 'root');
  });

  it('renames a file', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useRenameFile('v1', '/'), {
      wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
    });

    await result.current.mutateAsync({ fullPath: '/x.txt', newName: 'renamed.txt' });
    expect(renameFile).toHaveBeenCalledWith('v1', '/x.txt', 'renamed.txt');
  });

  it('renames a folder', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useRenameFolder('v1', '/'), {
      wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
    });

    await result.current.mutateAsync({ folderPath: '/docs', newName: 'guides' });
    expect(renameFolder).toHaveBeenCalledWith('v1', '/docs', 'guides');
  });

  it('creates folder', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useCreateFolder('v1'), {
      wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
    });

    await result.current.mutateAsync('/docs');
    expect(createFolder).toHaveBeenCalledWith('v1', '/docs');
  });

  describe('after a trash, the gallery refetch runs in the background (T-0034)', () => {
    const mediaItem = (fullPath: string): MediaFileRecord => ({
      fileNodeId: `node-${fullPath}`,
      fullPath,
      size: 1,
      contentType: 'image/jpeg',
      contentHash: `hash-${fullPath}`,
      updatedAt: '2026-01-01T00:00:00.000Z',
      state: 'ACTIVE'
    });
    const pages: Record<string, MediaListResponse> = {
      first: {
        items: [mediaItem('/a.jpg'), mediaItem('/trip/b.jpg'), mediaItem('/trip/c.jpg')],
        nextCursor: 'c1'
      },
      c1: { items: [mediaItem('/d.jpg'), mediaItem('/trips/e.jpg')] }
    };
    let gate: Promise<void> | null = null;
    let releaseGate = () => {};

    beforeEach(() => {
      gate = null;
      moveToTrash.mockImplementation(async () => {});
      listMedia.mockReset();
      listMedia.mockImplementation(async (_dockspaceId: string, options?: { cursor?: string }) => {
        if (gate) await gate;
        return pages[options?.cursor ?? 'first'];
      });
    });

    /** Renders the gallery query with both pages loaded, then holds every later gallery request. */
    const renderWithGallery = async <T,>(useMutationHook: () => T) => {
      const client = createTestQueryClient();
      const view = renderHook(() => ({ media: useMediaFiles('v1'), mutation: useMutationHook() }), {
        wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
      });
      await waitFor(() => expect(view.result.current.media.isSuccess).toBe(true));
      await act(async () => {
        await view.result.current.media.fetchNextPage();
      });
      expect(listMedia).toHaveBeenCalledTimes(2);
      gate = new Promise<void>((resolve) => (releaseGate = resolve));
      // Read the cache itself: observers re-render on a later tick.
      const galleryKey = ['media', 'u1', 'v1'];
      return {
        ...view,
        cachedPaths: () =>
          client
            .getQueryData<InfiniteData<MediaListResponse>>(galleryKey)
            ?.pages.map((page) => page.items.map((item) => item.fullPath)),
        galleryIsFetching: () => client.getQueryState(galleryKey)?.fetchStatus === 'fetching'
      };
    };

    it('useTrashFilesBatch resolves before the held refetch ends, with the moved items already out of the cache', async () => {
      moveToTrash.mockImplementation(async (_dockspaceId: string, { fullPath }: { fullPath: string }) => {
        if (fullPath === '/d.jpg') throw new Error('Storage unavailable');
      });
      const { result, cachedPaths, galleryIsFetching } = await renderWithGallery(() => useTrashFilesBatch('v1'));

      let outcome: Awaited<ReturnType<typeof result.current.mutation.mutateAsync>> | undefined;
      await act(async () => {
        outcome = await result.current.mutation.mutateAsync(['/a.jpg', '/d.jpg']);
      });

      expect(outcome?.movedPaths).toEqual(['/a.jpg']);
      // The refetch of the first page has started and is still held.
      expect(listMedia).toHaveBeenCalledTimes(3);
      expect(galleryIsFetching()).toBe(true);
      // The failed item stays.
      expect(cachedPaths()).toEqual([
        ['/trip/b.jpg', '/trip/c.jpg'],
        ['/d.jpg', '/trips/e.jpg']
      ]);

      await act(async () => releaseGate());
      await waitFor(() => expect(galleryIsFetching()).toBe(false));
      expect(listMedia).toHaveBeenCalledTimes(4);
    });

    it('useMoveToTrash does not wait for the gallery refetch either, and drops a trashed folder\'s items', async () => {
      const { result, cachedPaths, galleryIsFetching } = await renderWithGallery(() => useMoveToTrash('v1', '/'));

      await act(async () => {
        await result.current.mutation.mutateAsync({ fullPath: '/trip', targetType: 'folder' });
      });

      expect(galleryIsFetching()).toBe(true);
      // Only items under /trip/ go; /trips/e.jpg is in another folder.
      expect(cachedPaths()).toEqual([['/a.jpg'], ['/d.jpg', '/trips/e.jpg']]);

      await act(async () => {
        await result.current.mutation.mutateAsync({ fullPath: '/d.jpg', targetType: 'file' });
      });
      expect(cachedPaths()).toEqual([['/a.jpg'], ['/trips/e.jpg']]);

      await act(async () => releaseGate());
      await waitFor(() => expect(galleryIsFetching()).toBe(false));
    });

    it('useMoveToTrash still waits for the open folder listing, which the files page needs to move focus', async () => {
      const client = createTestQueryClient();
      const { result } = renderHook(
        () => ({ files: useFiles('v1', 'root'), mutation: useMoveToTrash('v1', '/') }),
        { wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper> }
      );
      await waitFor(() => expect(result.current.files.isSuccess).toBe(true));
      const listingCalls = listFolderChildren.mock.calls.length;

      let releaseListing = () => {};
      listFolderChildren.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseListing = () => resolve({ parentFolderNodeId: 'root', items: [] });
          })
      );
      let settled = false;
      let pending: Promise<unknown> = Promise.resolve();
      act(() => {
        pending = result.current.mutation
          .mutateAsync({ fullPath: '/x.txt', targetType: 'file' })
          .then(() => {
            settled = true;
          });
      });
      await waitFor(() => expect(listFolderChildren).toHaveBeenCalledTimes(listingCalls + 1));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(settled).toBe(false);

      await act(async () => {
        releaseListing();
        await pending;
      });
      expect(settled).toBe(true);
      expect(client.getQueryData<{ items: unknown[] }>(['files', 'u1', 'v1', 'root'])?.items).toEqual([]);
    });
  });
});
