import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/apiClient';
import { clearSession, setSession } from '@/lib/authStore';
import { DockspacesPage } from '@/pages/DockspacesPage';

const mutateAsync = vi.hoisted(() => vi.fn(async () => {}));

const mockState = vi.hoisted(() => ({
  dockspacesResult: {
    isLoading: false,
    data: [] as unknown[],
    error: null as unknown
  },
  createDockspaceResult: {
    mutateAsync,
    isPending: false,
    isError: false,
    error: null as unknown
  }
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/files/CreateDockspaceForm', () => ({
  CreateDockspaceForm: ({ disabled }: { disabled?: boolean }) => (
    <div>{disabled ? 'CreateDockspaceForm-disabled' : 'CreateDockspaceForm-enabled'}</div>
  )
}));

vi.mock('@/components/files/DockspaceList', () => ({
  DockspaceList: () => <div>DockspaceList</div>
}));

vi.mock('@/components/auth/UnauthorizedNotice', () => ({
  UnauthorizedNotice: () => <div>UnauthorizedNotice</div>
}));

vi.mock('@/hooks/useDockspaces', () => ({
  useDockspaces: () => mockState.dockspacesResult,
  useCreateDockspace: () => mockState.createDockspaceResult
}));

beforeEach(() => {
  clearSession();
  mutateAsync.mockClear();
  mockState.createDockspaceResult = {
    mutateAsync,
    isPending: false,
    isError: false,
    error: null
  };
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe('DockspacesPage', () => {
  it('renders dockspaces page', () => {
    mockState.dockspacesResult = { isLoading: false, data: [], error: null };

    render(<DockspacesPage />);
    expect(screen.getByText('Dockspaces')).toBeInTheDocument();
    expect(screen.getByText('CreateDockspaceForm-enabled')).toBeInTheDocument();
    expect(screen.getByText('DockspaceList')).toBeInTheDocument();
  });

  it('renders unauthorized notice for 403', () => {
    mockState.dockspacesResult = {
      isLoading: false,
      data: [],
      error: new ApiError('Not authorized for this account', 403)
    };

    render(<DockspacesPage />);

    expect(screen.getByText('UnauthorizedNotice')).toBeInTheDocument();
  });

  it('creates a first dockspace with default name for empty state accounts', async () => {
    setSession({
      accessToken: 'a',
      idToken: 'i',
      email: 'first.user@example.com',
      userId: 'u1'
    });

    mockState.dockspacesResult = { isLoading: false, data: [], error: null };
    mockState.createDockspaceResult = {
      mutateAsync,
      isPending: false,
      isError: false,
      error: null
    };

    render(<DockspacesPage />);

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith('My dockspace');
    });
  });

  it('shows preparing empty state and disables create action while creating first dockspace', () => {
    setSession({
      accessToken: 'a',
      idToken: 'i',
      email: 'gustavo@example.com',
      userId: 'u1'
    });

    mockState.dockspacesResult = { isLoading: false, data: [], error: null };
    mockState.createDockspaceResult = {
      mutateAsync,
      isPending: true,
      isError: false,
      error: null
    };

    render(<DockspacesPage />);

    expect(
      screen.getByText('Preparing your first dockspace,', {
        exact: false
      })
    ).toBeInTheDocument();
    expect(screen.getByText('CreateDockspaceForm-disabled')).toBeInTheDocument();
  });
});
