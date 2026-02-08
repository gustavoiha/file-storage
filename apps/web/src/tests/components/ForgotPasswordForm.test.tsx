import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

const forgotPassword = vi.fn(async () => {});
const navigate = vi.fn(async () => {});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ forgotPassword })
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>,
  useNavigate: () => navigate
}));

describe('ForgotPasswordForm', () => {
  it('requests password reset', async () => {
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@a.com' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Send Reset Code' }));

    await waitFor(() => expect(forgotPassword).toHaveBeenCalledWith('a@a.com'));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/reset-password',
        search: { email: 'a@a.com' }
      })
    );
  });
});
