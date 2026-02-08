import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VaultsPage } from '@/pages/VaultsPage';

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/files/CreateVaultForm', () => ({
  CreateVaultForm: () => <div>CreateVaultForm</div>
}));

vi.mock('@/components/files/VaultList', () => ({
  VaultList: () => <div>VaultList</div>
}));

vi.mock('@/hooks/useVaults', () => ({
  useVaults: () => ({ isLoading: false, data: [] })
}));

describe('VaultsPage', () => {
  it('renders vaults page', () => {
    render(<VaultsPage />);
    expect(screen.getByText('Vaults')).toBeInTheDocument();
    expect(screen.getByText('CreateVaultForm')).toBeInTheDocument();
    expect(screen.getByText('VaultList')).toBeInTheDocument();
  });
});
