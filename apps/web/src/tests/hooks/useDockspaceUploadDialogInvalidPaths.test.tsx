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

    expect(result.current.validationError).toBe('1 file had an invalid upload path and was skipped.');
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

    expect(result.current.validationError).toBe('2 files had invalid upload paths and were skipped.');
  });

  it('reports one skipped file in the singular when staging a folder', () => {
    const { result, uploadFile } = renderUploadDialog();

    act(() => {
      result.current.stageFolderFiles([fileWithRelativePath('a.txt', 'photos/../a.txt')]);
    });

    expect(result.current.validationError).toBe('1 file had an invalid upload path and was skipped.');
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

    expect(result.current.validationError).toBe('3 files had invalid upload paths and were skipped.');
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
});
