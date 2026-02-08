import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateVaultForm } from '@/components/files/CreateVaultForm';

const mutateAsync = vi.fn(async () => {});

vi.mock('@/hooks/useVaults', () => ({
  useCreateVault: () => ({
    mutateAsync,
    isPending: false
  })
}));

describe('CreateVaultForm', () => {
  it('creates vault on submit', async () => {
    render(<CreateVaultForm />);

    fireEvent.change(screen.getByLabelText('Vault Name'), { target: { value: 'Docs' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create Vault' }));

    expect(mutateAsync).toHaveBeenCalledWith('Docs');
  });
});
