import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DockspaceList } from '@/components/files/DockspaceList';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
}));

describe('DockspaceList', () => {
  it('renders items', () => {
    render(
      <DockspaceList
        dockspaces={[
          {
            dockspaceId: 'v1',
            name: 'Main',
            dockspaceType: 'GENERIC_FILES',
            createdAt: '2026-01-01T00:00:00.000Z',
            totalFileCount: 12,
            totalSizeBytes: 3145728,
            lastUploadAt: '2026-02-10T00:00:00.000Z'
          }
        ]}
      />
    );

    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.getByText('Generic Files')).toBeInTheDocument();
  });
});
