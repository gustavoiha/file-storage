import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFiles, useMoveToTrash, useUploadFile } from '@/hooks/useFiles';
import { createTestQueryClient, QueryWrapper } from '@/tests/testUtils';

const { listFiles, uploadFile, moveToTrash } = vi.hoisted(() => ({
  listFiles: vi.fn(async () => [
    {
      fullPath: '/x.txt',
      size: 1,
      state: 'ACTIVE'
    }
  ]),
  uploadFile: vi.fn(async () => {}),
  moveToTrash: vi.fn(async () => {})
}));

vi.mock('@/lib/vaultApi', () => ({
  listFiles,
  listTrash: vi.fn(async () => []),
  listPurged: vi.fn(async () => []),
  uploadFile,
  moveToTrash,
  restoreFile: vi.fn(async () => {})
}));

describe('useFiles', () => {
  it('loads files', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useFiles('v1', '/'), {
      wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.fullPath).toBe('/x.txt');
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

    await result.current.mutateAsync('/x.txt');
    expect(moveToTrash).toHaveBeenCalledWith('v1', '/x.txt');
  });
});
