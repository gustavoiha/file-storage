import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';

vi.mock('@/components/auth/ForgotPasswordForm', () => ({
  ForgotPasswordForm: () => <div>ForgotPasswordForm</div>
}));

describe('ForgotPasswordPage', () => {
  it('renders forgot password page', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByText('Forgot Password')).toBeInTheDocument();
    expect(screen.getByText('ForgotPasswordForm')).toBeInTheDocument();
  });
});
