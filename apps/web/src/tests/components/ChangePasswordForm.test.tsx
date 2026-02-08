import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';

const changePassword = vi.fn(async () => {});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ changePassword })
}));

describe('ChangePasswordForm', () => {
  it('submits password update', async () => {
    render(<ChangePasswordForm />);

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Change Password' }));

    expect(changePassword).toHaveBeenCalledWith('old', 'new');
  });
});
