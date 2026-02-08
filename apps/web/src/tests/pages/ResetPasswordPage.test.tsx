import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({ email: 'a@a.com' })
}));

vi.mock('@/components/auth/ResetPasswordForm', () => ({
  ResetPasswordForm: ({ initialEmail }: { initialEmail?: string }) => (
    <div>ResetPasswordForm:{initialEmail}</div>
  )
}));

describe('ResetPasswordPage', () => {
  it('renders reset password page', () => {
    render(<ResetPasswordPage />);
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
    expect(screen.getByText('ResetPasswordForm:a@a.com')).toBeInTheDocument();
  });
});
