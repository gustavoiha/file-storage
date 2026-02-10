import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmSignUpPage } from '@/pages/ConfirmSignUpPage';

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({ email: 'a@a.com', message: 'Confirm account first.' })
}));

vi.mock('@/components/auth/ConfirmSignUpForm', () => ({
  ConfirmSignUpForm: ({
    initialEmail,
    initialMessage
  }: {
    initialEmail?: string;
    initialMessage?: string;
  }) => <div>{`ConfirmSignUpForm:${initialEmail}:${initialMessage}`}</div>
}));

describe('ConfirmSignUpPage', () => {
  it('renders confirm sign-up page', () => {
    render(<ConfirmSignUpPage />);

    expect(screen.getByText('Confirm Account')).toBeInTheDocument();
    expect(
      screen.getByText('ConfirmSignUpForm:a@a.com:Confirm account first.')
    ).toBeInTheDocument();
  });
});
