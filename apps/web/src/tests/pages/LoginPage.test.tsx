import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from '@/pages/LoginPage';

vi.mock('@/components/auth/LoginForm', () => ({
  LoginForm: () => <div>LoginForm</div>
}));

describe('LoginPage', () => {
  it('renders login page', () => {
    render(<LoginPage />);
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByText('LoginForm')).toBeInTheDocument();
  });
});
