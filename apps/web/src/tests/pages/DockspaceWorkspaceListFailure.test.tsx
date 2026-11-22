import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDockspaces } from '@/hooks/useDockspaces';
import { ApiError } from '@/lib/apiClient';
import { clearSession, setSession } from '@/lib/authStore';
import { DockspaceWorkspacePage } from '@/pages/DockspaceWorkspacePage';
import { QueryClient } from '@tanstack/react-query';
import { QueryWrapper } from '@/tests/testUtils';

// The real useDockspaces and a real query client: only the API call is mocked, so the test sees every GET /dockspaces
// the page sends.
const mocks = vi.hoisted(() => ({
  listDockspaces: vi.fn()
}));

vi.mock('@/lib/dockspaceApi', () => ({
  listDockspaces: mocks.listDockspaces,
  createDockspace: vi.fn()
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useParams: () => ({ dockspaceId: 'v1' })
  };
});

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

// Like the real pages, these observe the dockspace list themselves (the real files page calls useDockspaces for the
// dockspace name), which refetches a failed list when they mount.
vi.mock('@/pages/DockspaceFilesPage', () => ({
  DockspaceFilesPage: () => {
    const query = useDockspaces();
    return <div>DockspaceFilesPage:{query.data?.length ?? 'none'}</div>;
  }
}));

vi.mock('@/pages/DockspaceMediaPage', () => ({
  DockspaceMediaPage: ({ dockspaceName }: { dockspaceName: string }) => {
    useDockspaces();
    return <div>DockspaceMediaPage:{dockspaceName}</div>;
  }
}));

const genericDockspace = {
  dockspaceId: 'v1',
  name: 'Main',
  dockspaceType: 'GENERIC_FILES',
  createdAt: '2026-01-01T00:00:00.000Z',
  totalFileCount: 0,
  totalSizeBytes: 0
};

const serverError = () => new ApiError('Internal server error', 500);

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const renderPage = () => {
  // The app's query client settings (router/AuthenticatedLayout.tsx).
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 10_000 } } });
  return render(
    <QueryWrapper client={client}>
      <DockspaceWorkspacePage />
    </QueryWrapper>
  );
};

/** Lets any request loop run: a loop sends hundreds of requests in this time. */
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
  });
};

beforeEach(() => {
  setSession({ accessToken: 'a', idToken: 'i', email: 'a@a.com', userId: 'u1' });
  mocks.listDockspaces.mockReset();
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe('DockspaceWorkspacePage when the dockspace list fails', () => {
  it('sends one request and shows the error with Try again instead of loading for ever', async () => {
    mocks.listDockspaces.mockRejectedValue(serverError());

    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load this dockspace.");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    await settle();

    expect(mocks.listDockspaces).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Loading dockspace...')).not.toBeInTheDocument();
    expect(screen.queryByText(/DockspaceFilesPage/)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this dockspace.");
  });

  it('refetches once per Try again press and keeps the error and focus while the retry fails', async () => {
    mocks.listDockspaces.mockRejectedValueOnce(serverError());
    renderPage();
    const button = await screen.findByRole('button', { name: 'Try again' });

    const retry = deferred<never>();
    mocks.listDockspaces.mockReturnValueOnce(retry.promise);
    button.focus();
    fireEvent.click(button);

    // React Query clears the error while it refetches a list it has no data for: the error and its button stay.
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'));
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Trying again…');
    expect(button).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this dockspace.");
    expect(screen.queryByText('Loading dockspace...')).not.toBeInTheDocument();

    // A second press while the retry is in flight does not send another request.
    fireEvent.click(button);
    expect(mocks.listDockspaces).toHaveBeenCalledTimes(2);

    await act(async () => {
      retry.reject(serverError());
    });
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'));
    expect(button).toHaveTextContent('Try again');
    expect(document.activeElement).toBe(button);

    await settle();
    expect(mocks.listDockspaces).toHaveBeenCalledTimes(2);
  });

  it('shows the files page after a successful Try again and moves focus off <body>', async () => {
    mocks.listDockspaces.mockRejectedValueOnce(serverError());
    const { container } = renderPage();
    const button = await screen.findByRole('button', { name: 'Try again' });

    mocks.listDockspaces.mockResolvedValueOnce([genericDockspace]);
    button.focus();
    fireEvent.click(button);

    expect(await screen.findByText('DockspaceFilesPage:1')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const workspace = container.querySelector('.dockspace-workspace');
    expect(document.activeElement).toBe(workspace);

    await settle();
    expect(mocks.listDockspaces).toHaveBeenCalledTimes(2);

    // The wrapper is focusable only while it holds that focus.
    act(() => {
      (workspace as HTMLElement).blur();
    });
    expect(workspace).not.toHaveAttribute('tabindex');
  });

  it('shows the Photos & Videos media page after a successful Try again', async () => {
    mocks.listDockspaces.mockRejectedValueOnce(serverError());
    renderPage();
    const button = await screen.findByRole('button', { name: 'Try again' });

    mocks.listDockspaces.mockResolvedValueOnce([
      { ...genericDockspace, name: 'Camera Roll', dockspaceType: 'PHOTOS_VIDEOS' }
    ]);
    fireEvent.click(button);

    expect(await screen.findByText('DockspaceMediaPage:Camera Roll')).toBeInTheDocument();
    await settle();
    expect(mocks.listDockspaces).toHaveBeenCalledTimes(2);
  });

  it('shows the unauthorized notice without Try again when the list is forbidden', async () => {
    mocks.listDockspaces.mockRejectedValue(new ApiError('Forbidden', 403));
    renderPage();

    await waitFor(() => expect(mocks.listDockspaces).toHaveBeenCalledTimes(1));
    await settle();

    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByText('Loading dockspace...')).not.toBeInTheDocument();
    expect(mocks.listDockspaces).toHaveBeenCalledTimes(1);
  });
});

describe('DockspaceWorkspacePage while the dockspace list loads', () => {
  it('shows "Loading dockspace..." and then the files page', async () => {
    const list = deferred<(typeof genericDockspace)[]>();
    mocks.listDockspaces.mockReturnValueOnce(list.promise);
    renderPage();

    expect(screen.getByText('Loading dockspace...')).toBeInTheDocument();

    await act(async () => {
      list.resolve([genericDockspace]);
    });

    expect(await screen.findByText('DockspaceFilesPage:1')).toBeInTheDocument();
    expect(mocks.listDockspaces).toHaveBeenCalledTimes(1);
  });
});
