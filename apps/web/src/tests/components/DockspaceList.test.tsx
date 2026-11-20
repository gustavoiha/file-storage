import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DockspaceList } from '@/components/files/DockspaceList';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
}));

describe('DockspaceList', () => {
  afterEach(cleanup);

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

  it('uses a ul/li list without overriding the item role', () => {
    const { container } = render(
      <DockspaceList
        dockspaces={[
          { dockspaceId: 'v1', name: 'Main', dockspaceType: 'GENERIC_FILES', createdAt: '2026-01-01T00:00:00.000Z', totalFileCount: 0, totalSizeBytes: 0 },
          { dockspaceId: 'v2', name: 'Photos', dockspaceType: 'PHOTOS_VIDEOS', createdAt: '2026-01-02T00:00:00.000Z', totalFileCount: 0, totalSizeBytes: 0 }
        ]}
      />
    );

    const list = screen.getByRole('list', { name: 'Your dockspaces' });
    expect(list.tagName).toBe('UL');
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    items.forEach((item) => {
      expect(item.tagName).toBe('LI');
      expect(item).not.toHaveAttribute('role');
      expect(item.parentElement).toBe(list);
    });
    expect(container.querySelector('article')).toBeNull();
  });
});
