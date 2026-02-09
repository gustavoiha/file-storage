import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/apiClient';
import { VaultsPage } from '@/pages/VaultsPage';

const mockState = vi.hoisted(() => ({
  vaultsResult: {
    isLoading: false,
    data: [] as unknown[],
    error: null as unknown
  }
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/files/CreateVaultForm', () => ({
  CreateVaultForm: () => <div>CreateVaultForm</div>
}));

vi.mock('@/components/files/VaultList', () => ({
  VaultList: () => <div>VaultList</div>
}));

vi.mock('@/components/auth/UnauthorizedNotice', () => ({
  UnauthorizedNotice: () => <div>UnauthorizedNotice</div>
}));

vi.mock('@/hooks/useVaults', () => ({
  useVaults: () => mockState.vaultsResult
}));

describe('VaultsPage', () => {
  it('renders vaults page', () => {
    mockState.vaultsResult = { isLoading: false, data: [], error: null };

    render(<VaultsPage />);
    expect(screen.getByText('Vaults')).toBeInTheDocument();
    expect(screen.getByText('CreateVaultForm')).toBeInTheDocument();
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
});
