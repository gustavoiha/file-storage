import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DockspaceWorkspacePage } from '@/pages/DockspaceWorkspacePage';

const mockState = vi.hoisted(() => ({
  dockspacesResult: {
    isLoading: false,
    data: [
      {
        dockspaceId: 'v1',
        name: 'Main',
        dockspaceType: 'GENERIC_FILES'
      }
    ]
  }
}));

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ dockspaceId: 'v1' })
}));

vi.mock('@/hooks/useDockspaces', () => ({
  useDockspaces: () => mockState.dockspacesResult
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/ui/Page', () => ({
  Page: ({ children }: { children?: unknown }) => <div>{children as any}</div>
}));

vi.mock('@/pages/DockspaceFilesPage', () => ({
  DockspaceFilesPage: () => <div>DockspaceFilesPage</div>
}));

vi.mock('@/pages/DockspaceMediaPage', () => ({
  DockspaceMediaPage: ({ dockspaceName }: { dockspaceName: string }) => (
    <div>DockspaceMediaPage:{dockspaceName}</div>
  )
}));

describe('DockspaceWorkspacePage', () => {
  it('renders generic files workspace for GENERIC_FILES dockspaces', () => {
    mockState.dockspacesResult = {
      isLoading: false,
      data: [
        {
          dockspaceId: 'v1',
          name: 'Main',
          dockspaceType: 'GENERIC_FILES'
        }
      ]
    };

    render(<DockspaceWorkspacePage />);

    expect(screen.getByText('DockspaceFilesPage')).toBeInTheDocument();
  });

  it('renders media workspace for PHOTOS_VIDEOS dockspaces', () => {
    mockState.dockspacesResult = {
      isLoading: false,
      data: [
        {
          dockspaceId: 'v1',
          name: 'Camera Roll',
          dockspaceType: 'PHOTOS_VIDEOS'
        }
      ]
    };

    render(<DockspaceWorkspacePage />);

    expect(screen.getByText('DockspaceMediaPage:Camera Roll')).toBeInTheDocument();
  });
});
