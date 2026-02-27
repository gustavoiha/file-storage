import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TopNav } from '@/components/ui/TopNav';

const logout = vi.fn(async () => {});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    session: { email: 'x@y.com' },
    isAuthenticated: true,
    logout
  })
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
}));

describe('TopNav', () => {
  it('shows account dropdown actions and logout', () => {
    render(<TopNav />);

    expect(screen.getByText('Dockspace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Account actions' }));
    expect(screen.getByText('Change Password')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
