import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCreateFolder,
  useDiscoverFolder,
  useFiles,
  useMoveFiles,
  useMoveToTrash,
  useRenameFile,
  useRenameFolder,
  useUploadFile
} from '@/hooks/useFiles';
import { clearSession, setSession } from '@/lib/authStore';
import { createTestQueryClient, QueryWrapper } from '@/tests/testUtils';

const { listFolderChildren, createFolder, uploadFile, moveFiles, moveToTrash, renameFile, renameFolder } = vi.hoisted(() => ({
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
  moveToTrash: vi.fn(async () => {}),
  renameFile: vi.fn(async () => {}),
  renameFolder: vi.fn(async () => {})
}));

vi.mock('@/lib/dockspaceApi', () => ({
  listFolderChildren,
  listTrash: vi.fn(async () => []),
  listPurged: vi.fn(async () => []),
  createFolder,
  uploadFile,
  moveFiles,
  moveToTrash,
  renameFile,
  renameFolder,
  restoreFile: vi.fn(async () => {})
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
});
