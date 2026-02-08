import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCreateVault, useVaults } from '@/hooks/useVaults';
import { createTestQueryClient, QueryWrapper } from '@/tests/testUtils';

const { listVaults, createVault } = vi.hoisted(() => ({
  listVaults: vi.fn(async () => [
    {
      vaultId: 'v1',
      name: 'Main',
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ]),
  createVault: vi.fn(async () => ({
    vaultId: 'v2',
    name: 'Docs',
    createdAt: '2026-01-02T00:00:00.000Z'
  }))
}));

vi.mock('@/lib/vaultApi', () => ({
  listVaults,
  createVault
}));

describe('useVaults', () => {
  it('loads vaults', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useVaults(), {
      wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]?.vaultId).toBe('v1');
  });

  it('creates vault', async () => {
    const client = createTestQueryClient();
    const { result } = renderHook(() => useCreateVault(), {
      wrapper: ({ children }) => <QueryWrapper client={client}>{children}</QueryWrapper>
    });

    await result.current.mutateAsync('Docs');
    expect(createVault).toHaveBeenCalledWith('Docs', expect.any(Object));
  });
});
