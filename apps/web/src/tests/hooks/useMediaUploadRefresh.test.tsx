import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDockspaceUploadDialog } from '@/hooks/useDockspaceUploadDialog';
import { useUploadFile } from '@/hooks/useFiles';
import { mediaQueryKey, useMediaFiles, useRefreshMediaAfterUploads } from '@/hooks/useMedia';
import { clearSession, setSession } from '@/lib/authStore';
import { createTestQueryClient, QueryWrapper } from '@/tests/testUtils';

const { listMedia, uploadFile } = vi.hoisted(() => ({
  listMedia: vi.fn(async () => ({ items: [] as Array<{ fileNodeId: string }>, nextCursor: undefined })),
  uploadFile: vi.fn(async () => ({}))
}));

vi.mock('@/lib/dockspaceApi', () => ({
  listMedia,
  uploadFile
}));

// The media gallery's wiring (useDockspaceMediaController): the upload queue, the upload mutation and the
// refresh of the gallery once a batch finishes.
const useGalleryUploads = (dockspaceId: string) => {
  const media = useMediaFiles(dockspaceId);
  const upload = useUploadFile(dockspaceId, '/');
  const refreshMediaAfterUploads = useRefreshMediaAfterUploads(dockspaceId);
  const uploadDialog = useDockspaceUploadDialog({
    currentFolderPath: '/',
    uploadFile: upload.mutateAsync,
    onBatchComplete: () => {
      void refreshMediaAfterUploads();
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
