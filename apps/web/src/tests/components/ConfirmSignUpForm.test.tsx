import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmSignUpForm } from '@/components/auth/ConfirmSignUpForm';

const confirmSignUp = vi.fn(async () => {});
const resendSignUpCode = vi.fn(async () => {});
const navigate = vi.fn(async () => {});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ confirmSignUp, resendSignUpCode })
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>,
  useNavigate: () => navigate
}));

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('ConfirmSignUpForm', () => {
  it('confirms account and navigates to login', async () => {
    render(<ConfirmSignUpForm initialEmail="a@a.com" />);

    fireEvent.change(screen.getByLabelText('Confirmation code'), {
      target: { value: '123456' }
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Confirm Account' }));

    await waitFor(() =>
      expect(confirmSignUp).toHaveBeenCalledWith({ email: 'a@a.com', code: '123456' })
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/login' }));
  });

  it('resends confirmation code', async () => {
    render(<ConfirmSignUpForm initialEmail="a@a.com" />);

    fireEvent.click(screen.getByRole('button', { name: 'Resend Code' }));

    await waitFor(() => expect(resendSignUpCode).toHaveBeenCalledWith('a@a.com'));
    await waitFor(() =>
      expect(screen.getByText('A new confirmation code has been sent.')).toBeInTheDocument()
    );
  });
});
