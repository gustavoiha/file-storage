import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '@/components/auth/LoginForm';
import type { LoginResult } from '@/lib/authTypes';

const login = vi.fn<(payload: { email: string; password: string }) => Promise<LoginResult>>(async () => ({
  status: 'SIGNED_IN' as const,
  session: {
    accessToken: 'a',
    idToken: 'i',
    email: 'a@a.com',
    userId: 'u1'
  }
}));

const confirmLogin = vi.fn<(code: string) => Promise<LoginResult>>(async () => ({
  status: 'SIGNED_IN' as const,
  session: {
    accessToken: 'a',
    idToken: 'i',
    email: 'a@a.com',
    userId: 'u1'
  }
}));

const navigate = vi.fn(async () => {});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ login, confirmLogin })
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>,
  useNavigate: () => navigate
}));

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('LoginForm', () => {
  it('submits credentials and navigates when signed in', async () => {
    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@a.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({ email: 'a@a.com', password: 'secret' })
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/vaults' }));
  });

  it('handles confirmation challenge', async () => {
    login.mockResolvedValueOnce({
      status: 'CONFIRMATION_REQUIRED' as const,
      challengeType: 'EMAIL_CODE' as const,
      message: 'Enter the verification code sent to your email.'
    });

    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@a.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() =>
      expect(
        screen.getByText('Enter the verification code sent to your email.')
      ).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '123456' }
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm Sign In' }));

    await waitFor(() => expect(confirmLogin).toHaveBeenCalledWith('123456'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/vaults' }));
  });

  it('redirects to account confirmation when sign-up is not confirmed', async () => {
    login.mockResolvedValueOnce({
      status: 'SIGN_UP_CONFIRMATION_REQUIRED' as const,
      email: 'a@a.com',
      message: 'Confirm your account with the email code.'
    });

    render(<LoginForm />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@a.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/confirm-signup',
        search: {
          email: 'a@a.com',
          message: 'Confirm your account with the email code.'
        }
      })
    );
  });
});
