import type { FormEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAddFolderDialog } from '@/hooks/useAddFolderDialog';

describe('useAddFolderDialog', () => {
  it('keeps spaces in folder path when creating', async () => {
    const createFolder = vi.fn(async () => ({}));
    const { result } = renderHook(() =>
      useAddFolderDialog({
        createFolder,
        currentFolderPath: '/',
        fetchedFolderPaths: []
      })
    );

    act(() => {
      result.current.onFolderNameChange('my folder');
    });

    await act(async () => {
      await result.current.onSubmit({
        preventDefault: () => {}
      } as FormEvent<HTMLFormElement>);
    });

    expect(createFolder).toHaveBeenCalledWith('/my folder');
  });
});
