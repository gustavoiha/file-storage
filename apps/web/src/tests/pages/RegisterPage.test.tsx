import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RegisterPage } from '@/pages/RegisterPage';

vi.mock('@/components/auth/RegisterForm', () => ({
  RegisterForm: () => <div>RegisterForm</div>
}));

describe('RegisterPage', () => {
  it('renders register page', () => {
    render(<RegisterPage />);
    expect(screen.getByText('Create Account')).toBeInTheDocument();
    expect(screen.getByText('RegisterForm')).toBeInTheDocument();
  });
});
