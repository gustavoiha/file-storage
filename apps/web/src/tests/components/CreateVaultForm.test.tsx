import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateVaultForm } from '@/components/files/CreateVaultForm';

const mutateAsync = vi.fn(async () => {});
const mockState = vi.hoisted(() => ({
  isPending: false
}));

vi.mock('@/hooks/useVaults', () => ({
  useCreateVault: () => ({
    mutateAsync,
    isPending: mockState.isPending
  })
}));

beforeEach(() => {
  mutateAsync.mockClear();
  mockState.isPending = false;
});

afterEach(() => {
  cleanup();
});

describe('CreateVaultForm', () => {
  it('creates vault on submit', async () => {
    render(<CreateVaultForm />);

    fireEvent.change(screen.getByLabelText('Vault Name'), { target: { value: 'Docs' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create Vault' }));

    expect(mutateAsync).toHaveBeenCalledWith('Docs');
  });

  it('disables controls when externally disabled', () => {
    render(<CreateVaultForm disabled />);

    expect(screen.getByLabelText('Vault Name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create Vault' })).toBeDisabled();
  });
});
