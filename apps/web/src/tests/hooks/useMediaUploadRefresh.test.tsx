import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDockspaceUploadDialog } from '@/hooks/useDockspaceUploadDialog';
import { useUploadFile } from '@/hooks/useFiles';
import { mediaQueryKey, useMediaFiles, useRefreshMediaAfterUploads } from '@/hooks/useMedia';
import type { MediaFileRecord } from '@/lib/apiTypes';
import { clearSession, setSession } from '@/lib/authStore';
import { createTestQueryClient, QueryWrapper } from '@/tests/testUtils';

const { listMedia, uploadFile } = vi.hoisted(() => ({
  listMedia: vi.fn(
    async (_dockspaceId: string, _options?: { cursor?: string; limit?: number }) => ({
      items: [] as Array<Partial<MediaFileRecord> & { fileNodeId: string }>,
      nextCursor: undefined as string | undefined
    })
  ),
  uploadFile: vi.fn(async () => ({}))
}));

vi.mock('@/lib/dockspaceApi', () => ({
  listMedia,
  uploadFile
}));

// The media gallery's wiring (useDockspaceMediaController): the upload queue, the upload mutation and the
// refresh of the gallery once a batch finishes.
// The real follow-up waits about a minute in all (covered with fake timers in mediaThumbnailFollowUp.test.ts); these
// tests keep the same number of rounds with short waits.
const FOLLOW_UP_DELAYS_MS: readonly number[] = Array.from({ length: 5 }, () => 40);

const useGalleryUploads = (dockspaceId: string) => {
  const media = useMediaFiles(dockspaceId);
  const upload = useUploadFile(dockspaceId, '/');
  const refreshMediaAfterUploads = useRefreshMediaAfterUploads(dockspaceId, {
    thumbnailFollowUpDelaysMs: FOLLOW_UP_DELAYS_MS
  });
  const uploadDialog = useDockspaceUploadDialog({
    currentFolderPath: '/',
    uploadFile: upload.mutateAsync,
    onBatchComplete: (_uploadedCount, uploadedPaths) => {
      void refreshMediaAfterUploads(uploadedPaths);
    }
  });

  return { media, uploadDialog };
};

const deferredUploads = () => {
  const completions: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
  uploadFile.mockImplementation(
    async () =>
      await new Promise<object>((resolve, reject) => {
        completions.push({ resolve: () => resolve({}), reject });
      })
  );
  return completions;
};

beforeEach(() => {
  setSession({
    accessToken: 'a',
    idToken: 'i',
    email: 'a@a.com',
    userId: 'u1'
  });
  listMedia.mockReset();
  listMedia.mockImplementation(async () => ({ items: [], nextCursor: undefined }));
  uploadFile.mockReset();
  uploadFile.mockImplementation(async () => ({}));
});

afterEach(() => {
  cleanup();
  clearSession();
});

const renderGallery = () => {
  const client = createTestQueryClient();
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  const rendered = renderHook(() => useGalleryUploads('v1'), {
    wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
  });
  const mediaInvalidations = () =>
    invalidateSpy.mock.calls.filter(([filters]) => filters?.queryKey?.[0] === 'media').length;
  return { ...rendered, client, mediaInvalidations };
};

describe('media gallery uploads', () => {
  it('refreshes the media query after a successful upload, showing the new file', async () => {
    const { result, mediaInvalidations } = renderGallery();
    await waitFor(() => expect(result.current.media.isSuccess).toBe(true));
    expect(listMedia).toHaveBeenCalledTimes(1);

    listMedia.mockImplementation(async () => ({
      items: [{ fileNodeId: 'new-photo' }],
      nextCursor: undefined
    }));

    act(() => {
      result.current.uploadDialog.stageFiles([new File(['x'], 'photo.jpg', { type: 'image/jpeg' })]);
    });

    await waitFor(() =>
      expect(result.current.media.data?.pages[0]?.items).toEqual([{ fileNodeId: 'new-photo' }])
    );
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(listMedia).toHaveBeenCalledTimes(2);
    expect(mediaInvalidations()).toBe(1);
  });

  it('refreshes the gallery once per batch, not once per file', async () => {
    const completions = deferredUploads();
    const { result, mediaInvalidations } = renderGallery();
    await waitFor(() => expect(result.current.media.isSuccess).toBe(true));

    act(() => {
      result.current.uploadDialog.stageFiles(
        Array.from({ length: 6 }, (_, index) => new File(['x'], `photo-${index}.jpg`, { type: 'image/jpeg' }))
      );
    });

    // Four run in parallel; finishing them starts the last two.
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(4));
    act(() => {
      for (const completion of completions.slice(0, 4)) {
        completion.resolve();
      }
    });
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(6));
    expect(mediaInvalidations()).toBe(0);

    act(() => {
      completions[4]?.resolve();
    });
    await waitFor(() =>
      expect(result.current.uploadDialog.activeUploads.filter((item) => item.status === 'uploading')).toHaveLength(1)
    );
    expect(mediaInvalidations()).toBe(0);

    act(() => {
      completions[5]?.resolve();
    });
    await waitFor(() => expect(result.current.uploadDialog.activeUploads).toHaveLength(0));
    await waitFor(() => expect(mediaInvalidations()).toBe(1));
    await waitFor(() => expect(listMedia).toHaveBeenCalledTimes(2));
    expect(result.current.uploadDialog.isUploading).toBe(false);
  });

  it('refreshes once when the last upload of a batch fails after others succeeded', async () => {
    const completions = deferredUploads();
    const { result, mediaInvalidations } = renderGallery();
    await waitFor(() => expect(result.current.media.isSuccess).toBe(true));

    act(() => {
      result.current.uploadDialog.stageFiles([
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'b.jpg', { type: 'image/jpeg' })
      ]);
    });
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(2));

    act(() => {
      completions[0]?.resolve();
    });
    await waitFor(() => expect(result.current.uploadDialog.activeUploads).toHaveLength(1));
    expect(mediaInvalidations()).toBe(0);

    act(() => {
      completions[1]?.reject(new Error('Network down'));
    });
    await waitFor(() => expect(result.current.uploadDialog.activeUploads[0]?.status).toBe('failed'));
    await waitFor(() => expect(mediaInvalidations()).toBe(1));
    await waitFor(() => expect(listMedia).toHaveBeenCalledTimes(2));
  });

  it('does not refresh the gallery when no upload of the batch succeeded, and refreshes after a successful retry', async () => {
    const completions = deferredUploads();
    const { result, mediaInvalidations } = renderGallery();
    await waitFor(() => expect(result.current.media.isSuccess).toBe(true));

    act(() => {
      result.current.uploadDialog.stageFiles([new File(['a'], 'a.jpg', { type: 'image/jpeg' })]);
    });
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
    act(() => {
      completions[0]?.reject(new Error('Network down'));
    });
    await waitFor(() => expect(result.current.uploadDialog.activeUploads[0]?.status).toBe('failed'));
    expect(mediaInvalidations()).toBe(0);
    expect(listMedia).toHaveBeenCalledTimes(1);

    const failedId = result.current.uploadDialog.activeUploads[0]!.id;
    act(() => {
      result.current.uploadDialog.retryUpload(failedId);
    });
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(2));
    act(() => {
      completions[1]?.resolve();
    });
    await waitFor(() => expect(result.current.uploadDialog.activeUploads).toHaveLength(0));
    await waitFor(() => expect(mediaInvalidations()).toBe(1));
    await waitFor(() => expect(listMedia).toHaveBeenCalledTimes(2));
  });

  it('refreshes only the gallery query of this dockspace', async () => {
    const { result, client, mediaInvalidations } = renderGallery();
    await waitFor(() => expect(result.current.media.isSuccess).toBe(true));
    client.setQueryData(mediaQueryKey('u1', 'other-dockspace'), { pages: [], pageParams: [] });

    act(() => {
      result.current.uploadDialog.stageFiles([new File(['x'], 'photo.jpg', { type: 'image/jpeg' })]);
    });

    await waitFor(() => expect(mediaInvalidations()).toBe(1));
    expect(client.getQueryState(mediaQueryKey('u1', 'other-dockspace'))?.isInvalidated).toBe(false);
    expect(client.getQueryState(mediaQueryKey('u1', 'v1'))?.dataUpdateCount).toBeGreaterThanOrEqual(1);
  });
});

describe('media gallery uploads: thumbnail follow-up', () => {
  const media = (name: string, withThumbnail: boolean): MediaFileRecord => ({
    fileNodeId: `node-${name}`,
    fullPath: `/${name}`,
    size: 1,
    contentType: name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg',
    contentHash: `hash-${name}`,
    updatedAt: '2026-11-22T10:00:00.000Z',
    state: 'ACTIVE',
    ...(withThumbnail ? { thumbnail: { url: `https://thumbs.example/${name}`, contentType: 'image/jpeg' } } : {})
  });
  // Long enough for every follow-up round to have run.
  const waitPastFollowUp = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, FOLLOW_UP_DELAYS_MS.length * 40 + 150));
    });
  };

  const galleryItem = (result: { current: ReturnType<typeof useGalleryUploads> }, name: string) =>
    result.current.media.data?.pages.flatMap((page) => page.items).find((item) => item.fullPath === `/${name}`);

  const uploadAndRefresh = async (
    result: { current: ReturnType<typeof useGalleryUploads> },
    names: string[],
    mediaInvalidations: () => number
  ) => {
    // useInfiniteQuery re-renders only for the result fields read so far: read the data before it changes.
    expect(galleryItem(result, names[0]!)).toBeUndefined();
    act(() => {
      result.current.uploadDialog.stageFiles(
        names.map((name) => new File(['x'], name, { type: name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg' }))
      );
    });
    await waitFor(() => expect(result.current.uploadDialog.activeUploads).toHaveLength(0));
    await waitFor(() => expect(mediaInvalidations()).toBe(1));
    await waitFor(() => expect(galleryItem(result, names[0]!)).toBeDefined());
  };

  it('shows the new tile thumbnail once it is generated, without another gallery refetch', async () => {
    const { result, mediaInvalidations } = renderGallery();
    await waitFor(() => expect(result.current.media.isSuccess).toBe(true));

    // Request 2 is the batch refresh and request 3 the first follow-up: both list the new photo before its
    // thumbnail exists. It is ready from request 4 on.
    listMedia.mockImplementation(async () => ({
      items: [media('photo.jpg', listMedia.mock.calls.length >= 4), media('older.jpg', true)],
      nextCursor: undefined
    }));
    await uploadAndRefresh(result, ['photo.jpg'], mediaInvalidations);

    await waitFor(() =>
      expect(galleryItem(result, 'photo.jpg')?.thumbnail?.url).toBe('https://thumbs.example/photo.jpg')
    );
    const responses = await Promise.all(listMedia.mock.results.map((entry) => entry.value));
    expect(responses[1]?.items[0]?.thumbnail).toBeUndefined();
    expect(responses[2]?.items[0]?.thumbnail).toBeUndefined();
    expect(listMedia).toHaveBeenNthCalledWith(3, 'v1', { limit: 120 });
    expect(listMedia).toHaveBeenNthCalledWith(4, 'v1', { limit: 120 });
    const callsWhenShown = listMedia.mock.calls.length;
    expect(callsWhenShown).toBe(4);

    // Stops once it has the thumbnail; the gallery query itself was refetched only once for the batch.
    await waitPastFollowUp();
    expect(listMedia).toHaveBeenCalledTimes(callsWhenShown);
    expect(mediaInvalidations()).toBe(1);
    expect(result.current.media.data?.pages).toHaveLength(1);
    expect(result.current.media.data?.pages[0]?.items.map((item) => item.fullPath)).toEqual([
      '/photo.jpg',
      '/older.jpg'
    ]);
  });

  it('sends no follow-up when the batch refresh already lists the thumbnail', async () => {
    const { result, mediaInvalidations } = renderGallery();
    await waitFor(() => expect(result.current.media.isSuccess).toBe(true));
    listMedia.mockImplementation(async () => ({ items: [media('photo.jpg', true)], nextCursor: undefined }));

    await uploadAndRefresh(result, ['photo.jpg'], mediaInvalidations);
    await waitPastFollowUp();
    expect(listMedia).toHaveBeenCalledTimes(2);
  });

  it('gives up after its last round when a thumbnail never comes', async () => {
    const { result, mediaInvalidations } = renderGallery();
    await waitFor(() => expect(result.current.media.isSuccess).toBe(true));
    listMedia.mockImplementation(async () => ({ items: [media('clip.mp4', false)], nextCursor: undefined }));

    await uploadAndRefresh(result, ['clip.mp4'], mediaInvalidations);
    await waitFor(() => expect(listMedia).toHaveBeenCalledTimes(2 + FOLLOW_UP_DELAYS_MS.length));
    await waitPastFollowUp();
    expect(listMedia).toHaveBeenCalledTimes(2 + FOLLOW_UP_DELAYS_MS.length);
    expect(mediaInvalidations()).toBe(1);
    expect(galleryItem(result, 'clip.mp4')?.thumbnail).toBeUndefined();
  });

  it('stops when the gallery unmounts', async () => {
    const { result, mediaInvalidations, unmount } = renderGallery();
    await waitFor(() => expect(result.current.media.isSuccess).toBe(true));
    listMedia.mockImplementation(async () => ({ items: [media('photo.jpg', false)], nextCursor: undefined }));

    await uploadAndRefresh(result, ['photo.jpg'], mediaInvalidations);
    unmount();
    const callsAtUnmount = listMedia.mock.calls.length;
    expect(callsAtUnmount).toBeLessThan(2 + FOLLOW_UP_DELAYS_MS.length);
    await waitPastFollowUp();
    expect(listMedia).toHaveBeenCalledTimes(callsAtUnmount);
  });
});
