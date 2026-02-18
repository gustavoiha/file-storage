import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDockspaceUploadDialog } from '@/hooks/useDockspaceUploadDialog';
import { ApiError } from '@/lib/apiClient';

describe('useDockspaceUploadDialog', () => {
  it('uploads files in parallel batches', async () => {
    const uploadCompletions: Array<() => void> = [];
    const uploadFile = vi.fn(
      async () =>
        await new Promise<void>((resolve) => {
          uploadCompletions.push(resolve);
        })
    );
    const { result } = renderHook(() =>
      useDockspaceUploadDialog({
        currentFolderPath: '/docs',
        uploadFile
      })
    );

    act(() => {
      result.current.stageFiles([
        new File(['one'], '1.txt', { type: 'text/plain' }),
        new File(['two'], '2.txt', { type: 'text/plain' }),
        new File(['three'], '3.txt', { type: 'text/plain' }),
        new File(['four'], '4.txt', { type: 'text/plain' }),
        new File(['five'], '5.txt', { type: 'text/plain' }),
        new File(['six'], '6.txt', { type: 'text/plain' })
      ]);
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expect(result.current.activeUploads.filter((item) => item.status === 'uploading')).toHaveLength(4)
    );
    expect(result.current.activeUploads.filter((item) => item.status === 'pending')).toHaveLength(2);

    act(() => {
      uploadCompletions[0]?.();
      uploadCompletions[1]?.();
      uploadCompletions[2]?.();
      uploadCompletions[3]?.();
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(6));

    act(() => {
      uploadCompletions[4]?.();
      uploadCompletions[5]?.();
    });

    await waitFor(() => expect(result.current.activeUploads).toHaveLength(0));
  });

  it('starts uploading immediately after staging files', async () => {
    const uploadFile = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useDockspaceUploadDialog({
        currentFolderPath: '/docs',
        uploadFile
      })
    );

    act(() => {
      result.current.stageFiles([
        new File(['one'], 'first.txt', { type: 'text/plain' }),
        new File(['two'], 'second.txt', { type: 'text/plain' })
      ]);
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.activeUploads).toHaveLength(0));
  });

  it('keeps folder relative paths and builds full upload path', async () => {
    const uploadFile = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useDockspaceUploadDialog({
        currentFolderPath: '/target',
        uploadFile
      })
    );

    const first = new File(['a'], 'a.txt', { type: 'text/plain' });
    Object.defineProperty(first, 'webkitRelativePath', {
      value: 'project/a.txt'
    });

    act(() => {
      result.current.stageFolderFiles([first]);
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fullPath: '/target/project/a.txt',
        onProgress: expect.any(Function)
      })
    );
  });

  it('keeps failed uploads in queue and retries them on demand', async () => {
    const uploadFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() =>
      useDockspaceUploadDialog({
        currentFolderPath: '/docs',
        uploadFile
      })
    );

    act(() => {
      result.current.stageFiles([new File(['bad'], 'bad.txt', { type: 'text/plain' })]);
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current.activeUploads).toEqual([
        expect.objectContaining({
          status: 'failed',
          errorMessage: 'network'
        })
      ])
    );
    expect(result.current.validationError).toBe('network');
    expect(result.current.isUploading).toBe(false);

    const failedUploadId = result.current.activeUploads[0]?.id;
    expect(failedUploadId).toBeTruthy();

    act(() => {
      result.current.retryUpload(failedUploadId!);
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.activeUploads).toHaveLength(0));
  });

  it('collects duplicate-skip responses without setting a validation error', async () => {
    const uploadFile = vi.fn(async () => {
      throw new ApiError('Upload skipped due to duplicate', 409, {
        code: 'UPLOAD_SKIPPED_DUPLICATE',
        duplicateType: 'NAME',
        fullPath: '/docs/duplicate.txt',
        reason: 'A file with the same name already exists in this folder.'
      });
    });
    const { result } = renderHook(() =>
      useDockspaceUploadDialog({
        currentFolderPath: '/docs',
        uploadFile
      })
    );

    act(() => {
      result.current.stageFiles([new File(['dup'], 'duplicate.txt', { type: 'text/plain' })]);
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.activeUploads).toHaveLength(0));
    expect(result.current.validationError).toBeNull();
    expect(result.current.skippedUploads).toEqual([
      {
        fullPath: '/docs/duplicate.txt',
        duplicateType: 'NAME',
        reason: 'A file with the same name already exists in this folder.'
      }
    ]);

    act(() => {
      result.current.clearSkippedUploads();
    });

    expect(result.current.skippedUploads).toEqual([]);
  });

  it('collects content-hash duplicate skips for media uploads', async () => {
    const uploadFile = vi.fn(async () => {
      throw new ApiError('Upload skipped due to duplicate', 409, {
        code: 'UPLOAD_SKIPPED_DUPLICATE',
        duplicateType: 'CONTENT_HASH',
        fullPath: '/docs/duplicate-photo.jpg',
        reason: 'A media file with the same content already exists in this dockspace.'
      });
    });
    const { result } = renderHook(() =>
      useDockspaceUploadDialog({
        currentFolderPath: '/docs',
        uploadFile
      })
    );

    act(() => {
      result.current.stageFiles([new File(['dup'], 'duplicate-photo.jpg', { type: 'image/jpeg' })]);
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.activeUploads).toHaveLength(0));
    expect(result.current.validationError).toBeNull();
    expect(result.current.skippedUploads).toEqual([
      {
        fullPath: '/docs/duplicate-photo.jpg',
        duplicateType: 'CONTENT_HASH',
        reason: 'A media file with the same content already exists in this dockspace.'
      }
    ]);
  });
});
