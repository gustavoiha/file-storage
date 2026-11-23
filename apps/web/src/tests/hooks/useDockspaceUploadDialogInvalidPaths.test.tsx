import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDockspaceUploadDialog } from '@/hooks/useDockspaceUploadDialog';

const fileWithRelativePath = (name: string, relativePath: string): File => {
  const file = new File(['x'], name, { type: 'text/plain' });
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
};

const renderUploadDialog = () => {
  const uploadFile = vi.fn(async () => {});
  const rendered = renderHook(() =>
    useDockspaceUploadDialog({
      currentFolderPath: '/docs',
      uploadFile
    })
  );
  return { ...rendered, uploadFile };
};

describe('useDockspaceUploadDialog invalid upload paths', () => {
  it('reports one skipped file in the singular when staging files', () => {
    const { result, uploadFile } = renderUploadDialog();

    act(() => {
      result.current.stageFiles([new File(['x'], '..', { type: 'text/plain' })]);
    });

    expect(result.current.invalidPathsNotice).toBe('1 file had an invalid upload path and was skipped.');
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('reports several skipped files in the plural when staging files', () => {
    const { result } = renderUploadDialog();

    act(() => {
      result.current.stageFiles([
        new File(['x'], '..', { type: 'text/plain' }),
        new File(['x'], '   ', { type: 'text/plain' })
      ]);
    });

    expect(result.current.invalidPathsNotice).toBe('2 files had invalid upload paths and were skipped.');
  });

  it('reports one skipped file in the singular when staging a folder', () => {
    const { result, uploadFile } = renderUploadDialog();

    act(() => {
      result.current.stageFolderFiles([fileWithRelativePath('a.txt', 'photos/../a.txt')]);
    });

    expect(result.current.invalidPathsNotice).toBe('1 file had an invalid upload path and was skipped.');
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('reports several skipped files in the plural when staging a folder', () => {
    const { result } = renderUploadDialog();

    act(() => {
      result.current.stageFolderFiles([
        fileWithRelativePath('a.txt', 'photos/../a.txt'),
        fileWithRelativePath('b.txt', 'photos/./b.txt'),
        fileWithRelativePath('c.txt', 'photos/ /c.txt')
      ]);
    });

    expect(result.current.invalidPathsNotice).toBe('3 files had invalid upload paths and were skipped.');
  });

  it('still uploads the valid files of a selection that has invalid ones', async () => {
    const { result, uploadFile } = renderUploadDialog();

    act(() => {
      result.current.stageFiles([
        new File(['x'], '..', { type: 'text/plain' }),
        new File(['ok'], 'ok.txt', { type: 'text/plain' })
      ]);
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ fullPath: '/docs/ok.txt' }));
  });

  describe('a selection that mixes valid and invalid paths', () => {
    it('keeps the skipped-files notice while and after the valid files upload (Upload files)', async () => {
      let finishUpload: () => void = () => {};
      const uploadFile = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishUpload = resolve;
          })
      );
      const { result } = renderHook(() =>
        useDockspaceUploadDialog({ currentFolderPath: '/docs', uploadFile })
      );

      act(() => {
        result.current.stageFiles([
          new File(['x'], '..', { type: 'text/plain' }),
          new File(['ok'], 'ok.txt', { type: 'text/plain' })
        ]);
      });

      await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
      expect(result.current.activeUploads).toHaveLength(1);
      expect(result.current.invalidPathsNotice).toBe('1 file had an invalid upload path and was skipped.');

      await act(async () => {
        finishUpload();
      });

      await waitFor(() => expect(result.current.activeUploads).toHaveLength(0));
      expect(result.current.invalidPathsNotice).toBe('1 file had an invalid upload path and was skipped.');
    });

    it('keeps the skipped-files notice after the folders are created and the valid files upload (Upload folder)', async () => {
      let finishCreateFolder: () => void = () => {};
      const createFolder = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishCreateFolder = resolve;
          })
      );
      const uploadFile = vi.fn(async () => {});
      const { result } = renderHook(() =>
        useDockspaceUploadDialog({ currentFolderPath: '/docs', uploadFile, createFolder })
      );

      act(() => {
        result.current.stageFolderFiles([
          fileWithRelativePath('a.txt', 'photos/../a.txt'),
          fileWithRelativePath('b.txt', 'photos/./b.txt'),
          fileWithRelativePath('c.txt', 'photos/trip/c.txt')
        ]);
      });

      await waitFor(() => expect(createFolder).toHaveBeenCalledWith('/docs/photos/trip'));
      expect(result.current.isPreparingFolders).toBe(true);
      expect(result.current.invalidPathsNotice).toBe('2 files had invalid upload paths and were skipped.');

      await act(async () => {
        finishCreateFolder();
      });

      await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
      expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ fullPath: '/docs/photos/trip/c.txt' }));
      await waitFor(() => expect(result.current.isUploading).toBe(false));
      expect(result.current.invalidPathsNotice).toBe('2 files had invalid upload paths and were skipped.');
    });

    it('keeps the skipped-files notice for a folder selection when no folder needs creating', async () => {
      const { result, uploadFile } = renderUploadDialog();

      act(() => {
        result.current.stageFolderFiles([
          fileWithRelativePath('a.txt', 'photos/../a.txt'),
          fileWithRelativePath('c.txt', 'photos/c.txt')
        ]);
      });

      await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(result.current.isUploading).toBe(false));
      expect(result.current.invalidPathsNotice).toBe('1 file had an invalid upload path and was skipped.');
    });

    it('reports a folder creation failure as an error and keeps the skipped-files notice', async () => {
      const createFolder = vi.fn(async () => {
        throw new Error('boom');
      });
      const uploadFile = vi.fn(async () => {});
      const { result } = renderHook(() =>
        useDockspaceUploadDialog({ currentFolderPath: '/docs', uploadFile, createFolder })
      );

      act(() => {
        result.current.stageFolderFiles([
          fileWithRelativePath('a.txt', 'photos/../a.txt'),
          fileWithRelativePath('c.txt', 'photos/trip/c.txt')
        ]);
      });

      await waitFor(() =>
        expect(result.current.validationError).toBe('Could not create the folders for this upload: boom')
      );
      expect(result.current.invalidPathsNotice).toBe('1 file had an invalid upload path and was skipped.');
      expect(uploadFile).not.toHaveBeenCalled();
    });

    it('reports an upload error as an error and keeps the skipped-files notice', async () => {
      const uploadFile = vi.fn(async () => {
        throw new Error('network');
      });
      const { result } = renderHook(() =>
        useDockspaceUploadDialog({ currentFolderPath: '/docs', uploadFile })
      );

      act(() => {
        result.current.stageFiles([
          new File(['x'], '..', { type: 'text/plain' }),
          new File(['ok'], 'ok.txt', { type: 'text/plain' })
        ]);
      });

      await waitFor(() => expect(result.current.validationError).toBe('network'));
      expect(result.current.invalidPathsNotice).toBe('1 file had an invalid upload path and was skipped.');
    });

    it('never reports the skipped-files notice as an error', async () => {
      const { result, uploadFile } = renderUploadDialog();

      act(() => {
        result.current.stageFiles([
          new File(['x'], '..', { type: 'text/plain' }),
          new File(['ok'], 'ok.txt', { type: 'text/plain' })
        ]);
      });

      expect(result.current.validationError).toBeNull();
      await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(result.current.isUploading).toBe(false));
      expect(result.current.validationError).toBeNull();
    });
  });

  describe('a later selection with only valid paths', () => {
    it.each([
      ['Upload files', 'stageFiles'],
      ['Upload folder', 'stageFolderFiles']
    ] as const)('clears an older skipped-files notice (%s)', async (_label, stage) => {
      const { result, uploadFile } = renderUploadDialog();

      act(() => {
        result.current.stageFiles([new File(['x'], '..', { type: 'text/plain' })]);
      });
      expect(result.current.invalidPathsNotice).toBe('1 file had an invalid upload path and was skipped.');

      act(() => {
        result.current[stage]([fileWithRelativePath('ok.txt', 'ok.txt')]);
      });

      expect(result.current.invalidPathsNotice).toBeNull();
      await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
      expect(result.current.invalidPathsNotice).toBeNull();
    });

    it('clears an older upload error', async () => {
      const uploadFile = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useDockspaceUploadDialog({ currentFolderPath: '/docs', uploadFile })
      );

      act(() => {
        result.current.stageFiles([new File(['a'], 'a.txt', { type: 'text/plain' })]);
      });
      await waitFor(() => expect(result.current.validationError).toBe('network'));

      act(() => {
        result.current.stageFiles([new File(['b'], 'b.txt', { type: 'text/plain' })]);
      });

      expect(result.current.validationError).toBeNull();
    });
  });

  it('clears both the error and the skipped-files notice with clearUploadMessages', async () => {
    const uploadFile = vi.fn(async () => {
      throw new Error('network');
    });
    const { result } = renderHook(() => useDockspaceUploadDialog({ currentFolderPath: '/docs', uploadFile }));

    act(() => {
      result.current.stageFiles([
        new File(['x'], '..', { type: 'text/plain' }),
        new File(['ok'], 'ok.txt', { type: 'text/plain' })
      ]);
    });
    await waitFor(() => expect(result.current.validationError).toBe('network'));

    act(() => {
      result.current.clearUploadMessages();
    });

    expect(result.current.validationError).toBeNull();
    expect(result.current.invalidPathsNotice).toBeNull();
  });
});
