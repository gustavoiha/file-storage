import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter
} from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopNav } from '@/components/ui/TopNav';
import { useDockspaces } from '@/hooks/useDockspaces';
import { ApiError } from '@/lib/apiClient';
import { clearSession, setSession } from '@/lib/authStore';
import { DockspaceWorkspacePage } from '@/pages/DockspaceWorkspacePage';

// The real switcher, page, useDockspaces and query client together: only the API call is mocked, so the test counts
// every GET /dockspaces the app sends while the list fails.
const mocks = vi.hoisted(() => ({
  listDockspaces: vi.fn(),
  isPhone: false
}));

vi.mock('@/lib/dockspaceApi', () => ({
  listDockspaces: mocks.listDockspaces,
  createDockspace: vi.fn()
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ session: { userId: 'u1' }, isAuthenticated: true, logout: vi.fn() })
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  PHONE_LAYOUT_QUERY: '(max-width: 900px)',
  useMediaQuery: () => mocks.isPhone
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

// Like the real files page, it observes the dockspace list itself (for the dockspace name).
vi.mock('@/pages/DockspaceFilesPage', () => ({
  DockspaceFilesPage: () => {
    const query = useDockspaces();
    return <main>Files page: {query.data?.[0]?.name}</main>;
  }
}));

vi.mock('@/pages/DockspaceMediaPage', () => ({
  DockspaceMediaPage: () => <main>Media page</main>
}));

const genericDockspace = {
  dockspaceId: 'v1',
  name: 'Personal Drive',
  dockspaceType: 'GENERIC_FILES',
  createdAt: '2026-01-01T00:00:00.000Z',
  totalFileCount: 0,
  totalSizeBytes: 0
};

const renderApp = async () => {
  // The app's query client settings (lib/queryClient.ts).
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 10_000 } } });
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <TopNav />
        <Outlet />
      </>
    )
  });
  const dockspacesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/dockspaces' });
  const workspaceRoute = createRoute({
    getParentRoute: () => dockspacesRoute,
    path: '/$dockspaceId',
    component: DockspaceWorkspacePage
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([dockspacesRoute.addChildren([workspaceRoute])]),
    history: createMemoryHistory({ initialEntries: ['/dockspaces/v1'] })
  });

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  await act(async () => {
    await router.load();
  });
};

/** Lets any request loop run: a loop sends hundreds of requests in this time. */
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
  });
};

const switcherNav = () => screen.getByRole('navigation', { name: 'Dockspaces' });

beforeEach(() => {
  setSession({ accessToken: 'a', idToken: 'i', email: 'a@a.com', userId: 'u1' });
  mocks.listDockspaces.mockReset();
  mocks.isPhone = false;
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe('the files page and the dockspace switcher when the dockspace list fails', () => {
  it('sends one request, shows both errors, and the switcher Try again refetches once', async () => {
    mocks.listDockspaces.mockRejectedValue(new ApiError('Internal server error', 500));

    await renderApp();
    await waitFor(() =>
      expect(within(switcherNav()).getByRole('alert')).toHaveTextContent("Couldn't load dockspaces.")
    );
    expect(await screen.findByText("Couldn't load this dockspace.")).toBeInTheDocument();
    await settle();
    expect(mocks.listDockspaces).toHaveBeenCalledTimes(1);

    // The switcher's Try again: one more request, and neither error swaps for a loader.
    fireEvent.click(within(switcherNav()).getByRole('button', { name: 'Try again' }));
    await settle();
    expect(mocks.listDockspaces).toHaveBeenCalledTimes(2);
    expect(within(switcherNav()).getByRole('alert')).toHaveTextContent("Couldn't load dockspaces.");
    expect(screen.getByText("Couldn't load this dockspace.")).toBeInTheDocument();
    expect(screen.queryByText('Loading dockspace...')).not.toBeInTheDocument();

    // It loads on the page's Try again: the files page and the switcher's tab show, with no further requests.
    mocks.listDockspaces.mockResolvedValue([genericDockspace]);
    const pageAlert = screen.getByText("Couldn't load this dockspace.").closest('[role="alert"]') as HTMLElement;
    fireEvent.click(within(pageAlert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Files page: Personal Drive')).toBeInTheDocument();
    expect(within(switcherNav()).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(switcherNav()).getAllByText('Personal Drive').length).toBeGreaterThan(0);
    await settle();
    expect(mocks.listDockspaces).toHaveBeenCalledTimes(3);
  });

  it('does not loop with the phone switcher bar either', async () => {
    mocks.isPhone = true;
    mocks.listDockspaces.mockRejectedValue(new ApiError('Internal server error', 500));

    await renderApp();
    expect(await screen.findByText("Couldn't load dockspaces.")).toBeInTheDocument();
    expect(await screen.findByText("Couldn't load this dockspace.")).toBeInTheDocument();
    await settle();
    expect(mocks.listDockspaces).toHaveBeenCalledTimes(1);
  });
});
