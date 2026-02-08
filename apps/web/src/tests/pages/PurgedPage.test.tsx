import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PurgedPage } from '@/pages/PurgedPage';

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ vaultId: 'v1' }),
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/hooks/useFiles', () => ({
  usePurged: () => ({
    isLoading: false,
    data: [{ fullPath: '/x.txt', purgedAt: '2026-01-01T00:00:00.000Z', state: 'PURGED' }]
  })
}));

describe('PurgedPage', () => {
  it('renders purged page', () => {
    render(<PurgedPage />);
    expect(screen.getByText('Purged History')).toBeInTheDocument();
    expect(screen.getByText('/x.txt')).toBeInTheDocument();
  });
});
