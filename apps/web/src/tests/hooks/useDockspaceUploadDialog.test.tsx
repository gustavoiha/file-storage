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
        folderPath: '/target',
        onProgress: expect.any(Function)
      })
    );
  });

  it('creates leaf folders sequentially before starting any upload of a folder selection', async () => {
    const folderCompletions: Array<() => void> = [];
    const createFolder = vi.fn(
      async () =>
        await new Promise<void>((resolve) => {
          folderCompletions.push(resolve);
        })
    );
    const uploadFile = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useDockspaceUploadDialog({
        currentFolderPath: '/target',
        uploadFile,
        createFolder
      })
    );

    const withRelativePath = (name: string, relativePath: string): File => {
      const file = new File(['x'], name, { type: 'text/plain' });
      Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
      return file;
    };

    act(() => {
      result.current.stageFolderFiles([
        withRelativePath('root.pdf', 'test/root.pdf'),
        withRelativePath('a1.pdf', 'test/test-a/a1.pdf'),
        withRelativePath('a2.pdf', 'test/test-a/a2.pdf'),
        withRelativePath('c1.pdf', 'test/test-b/test-c/c1.pdf'),
        withRelativePath('c2.pdf', 'test/test-b/test-c/c2.pdf')
      ]);
    });

    // Only the deepest folders are requested (ancestors are created server-side), one at a time.
    await waitFor(() => expect(createFolder).toHaveBeenCalledTimes(1));
    expect(createFolder).toHaveBeenCalledWith('/target/test/test-a');
    expect(result.current.isPreparingFolders).toBe(true);
    expect(result.current.isUploading).toBe(true);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(result.current.activeUploads).toHaveLength(0);

    act(() => {
      folderCompletions[0]?.();
    });

    await waitFor(() => expect(createFolder).toHaveBeenCalledTimes(2));
    expect(createFolder).toHaveBeenLastCalledWith('/target/test/test-b/test-c');
    expect(uploadFile).not.toHaveBeenCalled();

    act(() => {
      folderCompletions[1]?.();
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(5));
    expect(createFolder).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.activeUploads).toHaveLength(0));
    expect(result.current.isPreparingFolders).toBe(false);
    expect(result.current.validationError).toBeNull();
  });

  it('does not request folder creation when the selection only has files in the current folder', async () => {
    const createFolder = vi.fn(async () => {});
    const uploadFile = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useDockspaceUploadDialog({
        currentFolderPath: '/docs',
        uploadFile,
        createFolder
      })
    );

    act(() => {
      result.current.stageFiles([new File(['one'], 'first.txt', { type: 'text/plain' })]);
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
    expect(createFolder).not.toHaveBeenCalled();
  });

  it('reports an error and uploads nothing when a folder cannot be created', async () => {
    const createFolder = vi.fn(async () => {
      throw new Error('boom');
    });
    const uploadFile = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useDockspaceUploadDialog({
        currentFolderPath: '/target',
        uploadFile,
        createFolder
      })
    );

    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'webkitRelativePath', { value: 'project/a.txt' });

    act(() => {
      result.current.stageFolderFiles([file]);
    });

    await waitFor(() =>
      expect(result.current.validationError).toBe('Could not create the folders for this upload: boom')
    );
    expect(createFolder).toHaveBeenCalledWith('/target/project');
    expect(uploadFile).not.toHaveBeenCalled();
    expect(result.current.activeUploads).toHaveLength(0);
    expect(result.current.isUploading).toBe(false);
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

  it('reports a finished batch once, counting only the files that were uploaded', async () => {
    const onBatchComplete = vi.fn();
    const uploadFile = vi.fn(async ({ fullPath }: { fullPath: string }) => {
      if (fullPath === '/media/dup.jpg') {
        throw new ApiError('Upload skipped due to duplicate', 409, {
          code: 'UPLOAD_SKIPPED_DUPLICATE',
          duplicateType: 'CONTENT_HASH',
          fullPath,
          reason: 'Duplicate.'
        });
      }
    });
    const { result } = renderHook(() =>
      useDockspaceUploadDialog({
        currentFolderPath: '/media',
        uploadFile,
        onBatchComplete
      })
    );

    act(() => {
      result.current.stageFiles([
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
        new File(['c'], 'c.jpg', { type: 'image/jpeg' }),
        new File(['d'], 'dup.jpg', { type: 'image/jpeg' }),
        new File(['e'], 'e.jpg', { type: 'image/jpeg' })
      ]);
    });

    await waitFor(() => expect(result.current.activeUploads).toHaveLength(0));
    await waitFor(() => expect(onBatchComplete).toHaveBeenCalledTimes(1));
    expect(onBatchComplete).toHaveBeenCalledWith(4, expect.any(Array));
    // The uploaded files' paths, without the skipped duplicate (in the order they finished).
    expect([...(onBatchComplete.mock.calls[0]?.[1] as string[])].sort()).toEqual([
      '/media/a.jpg',
      '/media/b.jpg',
      '/media/c.jpg',
      '/media/e.jpg'
    ]);
    expect(uploadFile).toHaveBeenCalledTimes(5);
  });

  it('does not report a batch in which every file was skipped as a duplicate', async () => {
    const onBatchComplete = vi.fn();
    const uploadFile = vi.fn(async ({ fullPath }: { fullPath: string }) => {
      throw new ApiError('Upload skipped due to duplicate', 409, {
        code: 'UPLOAD_SKIPPED_DUPLICATE',
        duplicateType: 'NAME',
        fullPath,
        reason: 'Duplicate.'
      });
    });
    const { result } = renderHook(() =>
      useDockspaceUploadDialog({
        currentFolderPath: '/media',
        uploadFile,
        onBatchComplete
      })
    );

    act(() => {
      result.current.stageFiles([new File(['a'], 'a.jpg', { type: 'image/jpeg' })]);
    });

    await waitFor(() => expect(result.current.skippedUploads).toHaveLength(1));
    await waitFor(() => expect(result.current.activeUploads).toHaveLength(0));
    expect(onBatchComplete).not.toHaveBeenCalled();
  });
});
