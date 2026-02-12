import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreateDockspace, useDockspaces } from '@/hooks/useDockspaces';
import { clearSession, setSession } from '@/lib/authStore';
import { createTestQueryClient, QueryWrapper } from '@/tests/testUtils';

const { listDockspaces, createDockspace } = vi.hoisted(() => ({
  listDockspaces: vi.fn(async () => [
    {
      dockspaceId: 'v1',
      name: 'Main',
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ]),
  createDockspace: vi.fn(async () => ({
    dockspaceId: 'v2',
    name: 'Docs',
    createdAt: '2026-01-02T00:00:00.000Z'
  }))
}));

vi.mock('@/lib/dockspaceApi', () => ({
  listDockspaces,
  createDockspace
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

describe('useDockspaces', () => {
  it('loads dockspaces', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useDockspaces(), {
      wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.dockspaceId).toBe('v1');
  });

  it('creates dockspace', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useCreateDockspace(), {
      wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
    });

    await result.current.mutateAsync('Docs');
    expect(createDockspace).toHaveBeenCalledWith('Docs', expect.any(Object));
  });
});
