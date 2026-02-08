import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '@/components/auth/RequireAuth';

const navigate = vi.fn(async () => {});

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: true })
}));

describe('RequireAuth', () => {
  it('renders children when authenticated', () => {
    render(
      <RequireAuth>
        <div>Secure</div>
      </RequireAuth>
    );

    expect(screen.getByText('Secure')).toBeInTheDocument();
  });
});
