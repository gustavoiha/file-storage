import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/auth/ChangePasswordForm', () => ({
  ChangePasswordForm: () => <div>ChangePasswordForm</div>
}));

describe('ChangePasswordPage', () => {
  it('renders change password page', () => {
    render(<ChangePasswordPage />);
    expect(screen.getByText('Change Password')).toBeInTheDocument();
    expect(screen.getByText('ChangePasswordForm')).toBeInTheDocument();
  });
});
