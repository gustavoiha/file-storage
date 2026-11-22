import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter
} from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/apiClient';
import { clearSession, setSession } from '@/lib/authStore';
import { DockspaceUsagePage } from '@/pages/DockspaceUsagePage';
import { DockspacesPage } from '@/pages/DockspacesPage';

// The real pages, useDockspaces and query client: only the API call is mocked, so the tests count every
// GET /dockspaces the pages send while the list fails.
const mocks = vi.hoisted(() => ({
  listDockspaces: vi.fn()
}));

vi.mock('@/lib/dockspaceApi', () => ({
  listDockspaces: mocks.listDockspaces,
  createDockspace: vi.fn()
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

const dockspace = {
  dockspaceId: 'v1',
  name: 'Personal Drive',
  dockspaceType: 'GENERIC_FILES',
  createdAt: '2026-01-01T00:00:00.000Z',
  totalFileCount: 3,
  totalSizeBytes: 2048
};

const serverError = () => new ApiError('Internal server error', 500);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const renderAt = async (path: string) => {
  // The app's query client settings (lib/queryClient.ts).
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 10_000 } } });
  const rootRoute = createRootRoute();
  const dockspacesLayoutRoute = createRoute({ getParentRoute: () => rootRoute, path: '/dockspaces' });
  const dockspacesRoute = createRoute({
    getParentRoute: () => dockspacesLayoutRoute,
    path: '/',
    component: DockspacesPage
  });
  const workspaceRoute = createRoute({
    getParentRoute: () => dockspacesLayoutRoute,
    path: '/$dockspaceId',
    component: () => <main>Workspace</main>
  });
  const usageRoute = createRoute({
    getParentRoute: () => dockspacesLayoutRoute,
    path: '/$dockspaceId/usage',
    component: DockspaceUsagePage
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      dockspacesLayoutRoute.addChildren([dockspacesRoute, workspaceRoute, usageRoute])
    ]),
    history: createMemoryHistory({ initialEntries: [path] })
  });

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  await act(async () => {
    await router.load();
  });
  return client;
};

/** Lets any request loop run: a loop sends hundreds of requests in this time. */
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
  });
};

const tryAgainButton = () => screen.getByRole('button', { name: /Try again|Trying again/ });

beforeEach(() => {
  setSession({ accessToken: 'a', idToken: 'i', email: 'a@a.com', userId: 'u1' });
  mocks.listDockspaces.mockReset();
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe.each([
  {
    page: 'dockspaces page',
    path: '/dockspaces',
    message: "Couldn't load dockspaces.",
    loaded: () => screen.getByRole('link', { name: /Personal Drive/ })
  },
  {
    page: 'usage page',
    path: '/dockspaces/v1/usage',
    message: "Couldn't load this dockspace's usage.",
    loaded: () => screen.getByRole('link', { name: 'Back to dockspace' })
  }
])('$page with a failing dockspace list', ({ path, message, loaded }) => {
  it.each([
    ['a 500', serverError()],
    ['a network error', new TypeError('Failed to fetch')]
  ])('shows only the error with Try again for %s', async (_label, error) => {
    mocks.listDockspaces.mockRejectedValue(error);
    await renderAt(path);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(tryAgainButton()).toHaveTextContent('Try again');
    expect(screen.queryByText('Dockspace not found.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generic Files' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Photos & Videos' })).not.toBeInTheDocument();
    expect(screen.queryByText('UnauthorizedNotice')).not.toBeInTheDocument();

    await settle();
    expect(mocks.listDockspaces).toHaveBeenCalledTimes(1);
  });

  it('Try again sends one request per press, keeps the error and its focus through a failed retry, then shows the page', async () => {
    mocks.listDockspaces.mockRejectedValueOnce(serverError());
    await renderAt(path);
    await screen.findByRole('alert');

    const tryAgain = tryAgainButton();
    tryAgain.focus();

    const failedRetry = deferred<unknown>();
    mocks.listDockspaces.mockReturnValueOnce(failedRetry.promise);
    fireEvent.click(tryAgain);
    await waitFor(() => expect(tryAgain).toHaveAttribute('aria-busy', 'true'));
    expect(tryAgain).toHaveAttribute('aria-disabled', 'true');
    expect(tryAgain).not.toBeDisabled();
    expect(tryAgain).toHaveTextContent('Trying again…');
    // The error stays mounted during the refetch (no loader swap), and a second press does nothing.
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(/^Loading/)).not.toBeInTheDocument();
    fireEvent.click(tryAgain);
    expect(mocks.listDockspaces).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(tryAgain);

    await act(async () => {
      failedRetry.reject(serverError());
    });
    await waitFor(() => expect(tryAgain).not.toHaveAttribute('aria-busy'));
    expect(tryAgainButton()).toBe(tryAgain);
    expect(tryAgain).not.toHaveAttribute('aria-disabled');
    expect(document.activeElement).toBe(tryAgain);
    await settle();
    expect(mocks.listDockspaces).toHaveBeenCalledTimes(2);

    mocks.listDockspaces.mockResolvedValueOnce([dockspace]);
    fireEvent.click(tryAgain);
    await waitFor(() => expect(loaded()).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Try again was removed with the error: focus moves to the page's first control, not <body>.
    expect(document.activeElement).toBe(loaded());
    await settle();
    expect(mocks.listDockspaces).toHaveBeenCalledTimes(3);
  });

  it('keeps the error and a focused Try again through a refetch it did not start (e.g. the switcher\'s)', async () => {
    mocks.listDockspaces.mockRejectedValueOnce(serverError());
    const client = await renderAt(path);
    await screen.findByRole('alert');
    const tryAgain = tryAgainButton();
    tryAgain.focus();

    const refetch = deferred<unknown>();
    mocks.listDockspaces.mockReturnValueOnce(refetch.promise);
    act(() => {
      void client.refetchQueries({ queryKey: ['dockspaces'] });
    });
    await waitFor(() => expect(tryAgain).toHaveAttribute('aria-busy', 'true'));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByText(/^Loading/)).not.toBeInTheDocument();
    expect(document.activeElement).toBe(tryAgain);

    await act(async () => {
      refetch.reject(serverError());
    });
    await waitFor(() => expect(tryAgain).not.toHaveAttribute('aria-busy'));
    expect(tryAgainButton()).toBe(tryAgain);
    expect(document.activeElement).toBe(tryAgain);
  });

  it('does not move focus after a successful retry when Try again did not have it', async () => {
    mocks.listDockspaces.mockRejectedValueOnce(serverError());
    await renderAt(path);
    await screen.findByRole('alert');

    mocks.listDockspaces.mockResolvedValueOnce([dockspace]);
    fireEvent.click(tryAgainButton());
    await waitFor(() => expect(loaded()).toBeInTheDocument());
    expect(document.activeElement).toBe(document.body);
  });

  it('a retry that returns 403 shows Not Authorized and moves focus to the page title, not <body>', async () => {
    mocks.listDockspaces.mockRejectedValueOnce(serverError());
    await renderAt(path);
    await screen.findByRole('alert');

    const tryAgain = tryAgainButton();
    tryAgain.focus();
    mocks.listDockspaces.mockRejectedValueOnce(new ApiError('Not authorized for this account', 403));
    fireEvent.click(tryAgain);

    expect(await screen.findByText('Not Authorized')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(title);
  });

  it('shows the Not Authorized notice for a 403, without Try again', async () => {
    mocks.listDockspaces.mockRejectedValue(new ApiError('Not authorized for this account', 403));
    await renderAt(path);

    expect(await screen.findByText('Not Authorized')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('shows the loader while the list loads, then the page', async () => {
    const load = deferred<unknown>();
    mocks.listDockspaces.mockReturnValueOnce(load.promise);
    await renderAt(path);

    expect(screen.getByText(/^Loading/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => {
      load.resolve([dockspace]);
    });
    await waitFor(() => expect(loaded()).toBeInTheDocument());
    expect(screen.queryByText(/^Loading/)).not.toBeInTheDocument();
  });
});

describe('dockspace list loads after a failure', () => {
  it('dockspaces page: a successful retry on an empty account focuses the first create card', async () => {
    mocks.listDockspaces.mockRejectedValueOnce(serverError());
    await renderAt('/dockspaces');
    await screen.findByRole('alert');

    const tryAgain = tryAgainButton();
    tryAgain.focus();
    mocks.listDockspaces.mockResolvedValueOnce([]);
    fireEvent.click(tryAgain);

    const createGeneric = await screen.findByRole('button', { name: 'Generic Files' });
    expect(document.activeElement).toBe(createGeneric);
  });
});

describe('usage page when the list loaded', () => {
  it('says "Dockspace not found." for a list without that dockspace', async () => {
    mocks.listDockspaces.mockResolvedValue([{ ...dockspace, dockspaceId: 'other' }]);
    await renderAt('/dockspaces/v1/usage');

    expect(await screen.findByText('Dockspace not found.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a successful retry that loads a list without that dockspace moves focus to the page title, not <body>', async () => {
    mocks.listDockspaces.mockRejectedValueOnce(serverError());
    await renderAt('/dockspaces/v1/usage');
    await screen.findByRole('alert');

    const tryAgain = tryAgainButton();
    tryAgain.focus();
    mocks.listDockspaces.mockResolvedValueOnce([{ ...dockspace, dockspaceId: 'other' }]);
    fireEvent.click(tryAgain);

    expect(await screen.findByText('Dockspace not found.')).toBeInTheDocument();
    const title = screen.getByRole('heading', { level: 1, name: 'Detailed usage' });
    expect(title).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(title);
  });

  it('shows the usage of a listed dockspace', async () => {
    mocks.listDockspaces.mockResolvedValue([dockspace]);
    await renderAt('/dockspaces/v1/usage');

    expect(await screen.findByText('3 files')).toBeInTheDocument();
    expect(screen.getByText('2.00 KB')).toBeInTheDocument();
  });
});
