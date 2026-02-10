import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterForm } from '@/components/auth/RegisterForm';
import type { RegisterResult } from '@/lib/authTypes';

const register = vi.fn<(payload: { email: string; password: string }) => Promise<RegisterResult>>(
  async () => ({
    status: 'REGISTERED' as const
  })
);
const navigate = vi.fn(async () => {});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ register })
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>,
  useNavigate: () => navigate
}));

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('RegisterForm', () => {
  it('redirects to confirmation when sign up requires it', async () => {
    register.mockResolvedValueOnce({
      status: 'SIGN_UP_CONFIRMATION_REQUIRED' as const,
      email: 'a@a.com',
      message: 'Enter the confirmation code sent to your email.'
    });

    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@a.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({ email: 'a@a.com', password: 'secret' })
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        to: '/confirm-signup',
        search: {
          email: 'a@a.com',
          message: 'Enter the confirmation code sent to your email.'
        }
      })
    );
  });

  it('redirects to login after completed registration', async () => {
    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@a.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({ email: 'a@a.com', password: 'secret' })
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/login' }));
  });

  it('shows allowlist denial message', async () => {
    register.mockRejectedValueOnce(
      new Error('This email is not permitted to create an account.')
    );

    render(<RegisterForm />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'blocked@a.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() =>
      expect(
        screen.getByText('This email is not permitted to create an account.')
      ).toBeInTheDocument()
    );
  });
});
