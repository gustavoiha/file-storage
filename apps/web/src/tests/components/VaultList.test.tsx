import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VaultList } from '@/components/files/VaultList';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
}));

describe('VaultList', () => {
  it('renders items', () => {
    render(
      <VaultList
        vaults={[
          {
            vaultId: 'v1',
            name: 'Main',
            createdAt: '2026-01-01T00:00:00.000Z'
          }
        ]}
      />
    );

    expect(screen.getByText('Main')).toBeInTheDocument();
  });
});
