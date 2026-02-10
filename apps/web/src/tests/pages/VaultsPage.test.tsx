import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/apiClient';
import { clearSession, setSession } from '@/lib/authStore';
import { VaultsPage } from '@/pages/VaultsPage';

const mutateAsync = vi.hoisted(() => vi.fn(async () => {}));

const mockState = vi.hoisted(() => ({
  vaultsResult: {
    isLoading: false,
    data: [] as unknown[],
    error: null as unknown
  },
  createVaultResult: {
    mutateAsync,
    isPending: false,
    isError: false,
    error: null as unknown
  }
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/files/CreateVaultForm', () => ({
  CreateVaultForm: ({ disabled }: { disabled?: boolean }) => (
    <div>{disabled ? 'CreateVaultForm-disabled' : 'CreateVaultForm-enabled'}</div>
  )
}));

vi.mock('@/components/files/VaultList', () => ({
  VaultList: () => <div>VaultList</div>
}));

vi.mock('@/components/auth/UnauthorizedNotice', () => ({
  UnauthorizedNotice: () => <div>UnauthorizedNotice</div>
}));

vi.mock('@/hooks/useVaults', () => ({
  useVaults: () => mockState.vaultsResult,
  useCreateVault: () => mockState.createVaultResult
}));

beforeEach(() => {
  clearSession();
  mutateAsync.mockClear();
  mockState.createVaultResult = {
    mutateAsync,
    isPending: false,
    isError: false,
    error: null
  };
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe('VaultsPage', () => {
  it('renders vaults page', () => {
    mockState.vaultsResult = { isLoading: false, data: [], error: null };

    render(<VaultsPage />);
    expect(screen.getByText('Vaults')).toBeInTheDocument();
    expect(screen.getByText('CreateVaultForm-enabled')).toBeInTheDocument();
    expect(screen.getByText('VaultList')).toBeInTheDocument();
  });

  it('renders unauthorized notice for 403', () => {
    mockState.vaultsResult = {
      isLoading: false,
      data: [],
      error: new ApiError('Not authorized for this account', 403)
    };

    render(<VaultsPage />);

    expect(screen.getByText('UnauthorizedNotice')).toBeInTheDocument();
  });

  it('creates a first vault from email prefix for empty state accounts', async () => {
    setSession({
      accessToken: 'a',
      idToken: 'i',
      email: 'first.user@example.com',
      userId: 'u1'
    });

    mockState.vaultsResult = { isLoading: false, data: [], error: null };
    mockState.createVaultResult = {
      mutateAsync,
      isPending: false,
      isError: false,
      error: null
    };

    render(<VaultsPage />);

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith('first.user');
    });
  });

  it('shows preparing empty state and disables create action while creating first vault', () => {
    setSession({
      accessToken: 'a',
      idToken: 'i',
      email: 'gustavo@example.com',
      userId: 'u1'
    });

    mockState.vaultsResult = { isLoading: false, data: [], error: null };
    mockState.createVaultResult = {
      mutateAsync,
      isPending: true,
      isError: false,
      error: null
    };

    render(<VaultsPage />);

    expect(
      screen.getByText('Preparing your first vault,', {
        exact: false
      })
    ).toBeInTheDocument();
    expect(screen.getByText('CreateVaultForm-disabled')).toBeInTheDocument();
  });
});
