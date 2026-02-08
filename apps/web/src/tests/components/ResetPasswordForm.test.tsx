import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

const confirmForgotPassword = vi.fn(async () => {});
const navigate = vi.fn(async () => {});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ confirmForgotPassword })
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>,
  useNavigate: () => navigate
}));

describe('ResetPasswordForm', () => {
  it('confirms reset code', async () => {
    render(<ResetPasswordForm initialEmail="a@a.com" />);

    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-secret' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Set New Password' }));

    expect(confirmForgotPassword).toHaveBeenCalledWith({
      email: 'a@a.com',
      code: '123456',
      newPassword: 'new-secret'
    });
  });
});
