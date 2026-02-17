import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDockspaceUploadDialog } from '@/hooks/useDockspaceUploadDialog';

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

  it('removes a failed upload from the queue and exposes error text', async () => {
    const uploadFile = vi.fn(async () => {
      throw new Error('network');
    });
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
    await waitFor(() => expect(result.current.activeUploads).toHaveLength(0));
    expect(result.current.validationError).toBe('network');
  });
});
