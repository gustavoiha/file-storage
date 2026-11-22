import { useState, useSyncExternalStore } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams
} from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TopNav } from '@/components/ui/TopNav';
import { computeVisibleTabIds } from '@/components/ui/dockspaceTabsLayout';
import type { Dockspace } from '@/lib/apiTypes';
import { DockspaceWorkspacePage } from '@/pages/DockspaceWorkspacePage';

interface DockspacesResult {
  data: Dockspace[] | undefined;
  error: Error | null;
  isLoading: boolean;
  isFetching: boolean;
}

/** A tiny store so the useDockspaces mock can change its result and re-render its users. */
const dockspacesStore = vi.hoisted(() => {
  let result: DockspacesResult = { data: [], error: null, isLoading: false, isFetching: false };
  const listeners = new Set<() => void>();
  return {
    get: () => result,
    set: (next: Partial<DockspacesResult>) => {
      result = { ...result, ...next };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
});

const mocks = vi.hoisted(() => ({
  isPhone: false,
  refetch: vi.fn(async () => {}),
  mutateAsync: vi.fn()
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ session: { userId: 'u1' }, isAuthenticated: true, logout: vi.fn() })
}));

vi.mock('@/hooks/useMediaQuery', () => ({
  PHONE_LAYOUT_QUERY: '(max-width: 900px)',
  useMediaQuery: () => mocks.isPhone
}));

vi.mock('@/hooks/useDockspaces', () => ({
  useDockspaces: () => {
    const result = useSyncExternalStore(dockspacesStore.subscribe, dockspacesStore.get);
    return { ...result, refetch: mocks.refetch };
  },
  useCreateDockspace: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
    error: null,
    reset: () => {}
  })
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

// Stand-in for the files page, with state of its own (like the open folder) to check it resets.
vi.mock('@/pages/DockspaceFilesPage', () => ({
  DockspaceFilesPage: () => {
    const { dockspaceId } = useParams({ strict: false }) as { dockspaceId: string };
    const [openFolder, setOpenFolder] = useState('root');
    return (
      <main>
        <p>Files page: {dockspaceId}</p>
        <p>Open folder: {openFolder}</p>
        <button type="button" onClick={() => setOpenFolder('Travel')}>
          Open Travel
        </button>
      </main>
    );
  }
}));

vi.mock('@/pages/DockspaceMediaPage', () => ({
  DockspaceMediaPage: ({ dockspaceName }: { dockspaceName: string }) => <main>Media page: {dockspaceName}</main>
}));

const dockspace = (id: string, name: string, type: Dockspace['dockspaceType'] = 'GENERIC_FILES'): Dockspace => ({
  dockspaceId: id,
  name,
  dockspaceType: type,
  createdAt: '2026-01-01T00:00:00.000Z',
  totalFileCount: 0,
  totalSizeBytes: 0
});

const DOCKSPACES = [
  dockspace('d1', 'Personal Drive'),
  dockspace('d2', 'Camera Roll', 'PHOTOS_VIDEOS'),
  dockspace('d3', 'Work Projects'),
  dockspace('d4', 'Family Photos', 'PHOTOS_VIDEOS'),
  dockspace('d5', 'Tax Documents 2020-2026'),
  dockspace('d6', 'Band Recordings')
];

const renderApp = async (path: string) => {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <TopNav />
        <Outlet />
      </>
    )
  });
  const dockspacesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/dockspaces' });
  const listRoute = createRoute({
    getParentRoute: () => dockspacesRoute,
    path: '/',
    component: () => <main>Dockspaces list page</main>
  });
  const filesRoute = createRoute({
    getParentRoute: () => dockspacesRoute,
    path: '/$dockspaceId',
    component: DockspaceWorkspacePage
  });
  const trashRoute = createRoute({
    getParentRoute: () => dockspacesRoute,
    path: '/$dockspaceId/trash',
    component: () => <main>Trash page</main>
  });
  const usageRoute = createRoute({
    getParentRoute: () => dockspacesRoute,
    path: '/$dockspaceId/usage',
    component: () => <main>Usage page</main>
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      dockspacesRoute.addChildren([listRoute, filesRoute, trashRoute, usageRoute])
    ]),
    history: createMemoryHistory({ initialEntries: [path] })
  });

  render(<RouterProvider router={router} />);
  await act(async () => {
    await router.load();
  });
  return router;
};

const dockspacesNav = () => screen.getByRole('navigation', { name: 'Dockspaces' });

/** Gives the tab strip a layout: each tab 150px, More 90px, + 32px, the strip 500px wide. */
const stubTabLayout = (stripWidth: number) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    let width = 0;
    if (this.hasAttribute('data-measure-id')) {
      width = 150;
    } else if (this.hasAttribute('data-measure-more')) {
      width = 90;
    } else if (this.classList.contains('dockspace-tabs__create')) {
      width = 32;
    } else if (this.classList.contains('dockspace-tabs')) {
      width = stripWidth;
    }
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
  });

beforeEach(() => {
  mocks.isPhone = false;
  mocks.refetch.mockReset();
  mocks.refetch.mockImplementation(async () => {});
  mocks.mutateAsync.mockReset();
  dockspacesStore.set({ data: DOCKSPACES, error: null, isLoading: false, isFetching: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.style.overflow = '';
});

describe('computeVisibleTabIds', () => {
  const widths = { a: 100, b: 100, c: 100, d: 100 };

  it('shows every tab when they all fit', () => {
    expect(
      computeVisibleTabIds({ ids: ['a', 'b', 'c', 'd'], widths, currentId: 'a', available: 400, gap: 0, moreWidth: 50 })
    ).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps as many as fit next to More, in list order', () => {
    expect(
      computeVisibleTabIds({ ids: ['a', 'b', 'c', 'd'], widths, currentId: 'a', available: 300, gap: 0, moreWidth: 50 })
    ).toEqual(['a', 'b']);
  });

  it('keeps the current tab visible in place of the last tab that fits', () => {
    expect(
      computeVisibleTabIds({ ids: ['a', 'b', 'c', 'd'], widths, currentId: 'd', available: 300, gap: 0, moreWidth: 50 })
    ).toEqual(['a', 'd']);
  });

  it('keeps the current tab even when nothing else fits', () => {
    expect(
      computeVisibleTabIds({ ids: ['a', 'b', 'c', 'd'], widths, currentId: 'c', available: 120, gap: 0, moreWidth: 50 })
    ).toEqual(['c']);
  });
});

describe('DockspaceTabs (desktop)', () => {
  it('lists every dockspace by name and type, with the current one marked', async () => {
    await renderApp('/dockspaces/d2');

    const nav = dockspacesNav();
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(6);
    expect(within(nav).getByRole('link', { name: 'Personal Drive, Generic Files' })).not.toHaveAttribute(
      'aria-current'
    );
    expect(within(nav).getByRole('link', { name: 'Camera Roll, Photos & Videos' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(within(nav).getByRole('button', { name: 'New dockspace' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: /More/ })).not.toBeInTheDocument();
  });

  it('marks the current dockspace on the trash and usage pages too, and not on the list page', async () => {
    await renderApp('/dockspaces/d3/trash');
    expect(within(dockspacesNav()).getByRole('link', { name: 'Work Projects, Generic Files' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    cleanup();

    await renderApp('/dockspaces/d3/usage');
    expect(within(dockspacesNav()).getByRole('link', { name: 'Work Projects, Generic Files' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    cleanup();

    await renderApp('/dockspaces');
    expect(screen.getByText('Dockspaces list page')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Dockspaces' })).not.toBeInTheDocument();
  });

  it('switches to another dockspace at its root, without carrying over page state', async () => {
    const router = await renderApp('/dockspaces/d1');

    fireEvent.click(await screen.findByRole('button', { name: 'Open Travel' }));
    expect(screen.getByText('Open folder: Travel')).toBeInTheDocument();

    fireEvent.click(within(dockspacesNav()).getByRole('link', { name: 'Work Projects, Generic Files' }));

    expect(await screen.findByText('Files page: d3')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dockspaces/d3');
    expect(screen.getByText('Open folder: root')).toBeInTheDocument();
    expect(within(dockspacesNav()).getByRole('link', { name: 'Work Projects, Generic Files' })).toHaveAttribute(
      'aria-current',
      'page'
    );

    fireEvent.click(within(dockspacesNav()).getByRole('link', { name: 'Camera Roll, Photos & Videos' }));
    expect(await screen.findByText('Media page: Camera Roll')).toBeInTheDocument();
  });

  it('goes back to the dockspace root from trash when its current tab is clicked', async () => {
    const router = await renderApp('/dockspaces/d1/trash');

    fireEvent.click(within(dockspacesNav()).getByRole('link', { name: 'Personal Drive, Generic Files' }));

    expect(await screen.findByText('Files page: d1')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dockspaces/d1');
  });

  it('puts the tabs that do not fit into More (n) and keeps the current one in the strip', async () => {
    // 500 - 32 (+) leaves 468; next to More (90), only two 150px tabs fit.
    stubTabLayout(500);
    await renderApp('/dockspaces/d5');

    const nav = dockspacesNav();
    const tabs = within(nav)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('.dockspace-tab__name')?.textContent);
    expect(tabs).toEqual(['Personal Drive', 'Tax Documents 2020-2026']);
    expect(within(nav).getByRole('link', { name: 'Tax Documents 2020-2026, Generic Files' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(nav).getByRole('button', { name: 'More (4)' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens More with the filter focused, filters by name, and returns focus to More on Escape', async () => {
    stubTabLayout(500);
    await renderApp('/dockspaces/d1');

    const more = within(dockspacesNav()).getByRole('button', { name: 'More (4)' });
    fireEvent.click(more);

    expect(more).toHaveAttribute('aria-expanded', 'true');
    const filter = screen.getByRole('searchbox', { name: 'Filter dockspaces' });
    await waitFor(() => expect(filter).toHaveFocus());
    expect(screen.getByRole('link', { name: 'Band Recordings, Generic Files' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All dockspaces' })).not.toHaveAttribute('aria-current');

    fireEvent.change(filter, { target: { value: 'FAMILY' } });
    expect(screen.getByRole('link', { name: 'Family Photos, Photos & Videos' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Band Recordings, Generic Files' })).not.toBeInTheDocument();

    fireEvent.change(filter, { target: { value: 'zzz' } });
    expect(screen.getByText('No dockspaces match')).toBeInTheDocument();

    fireEvent.change(filter, { target: { value: '' } });
    fireEvent.keyDown(filter, { key: 'ArrowDown' });
    expect(screen.getByRole('link', { name: 'Work Projects, Generic Files' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' });
    expect(filter).toHaveFocus();

    fireEvent.keyDown(filter, { key: 'Escape' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveFocus();
  });

  it('opens a dockspace chosen in More and moves focus to its tab', async () => {
    stubTabLayout(500);
    const router = await renderApp('/dockspaces/d1');

    fireEvent.click(within(dockspacesNav()).getByRole('button', { name: 'More (4)' }));
    const row = screen.getByRole('link', { name: 'Band Recordings, Generic Files' });
    row.focus();
    fireEvent.click(row);

    expect(await screen.findByText('Files page: d6')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dockspaces/d6');
    const tab = within(dockspacesNav()).getByRole('link', { name: 'Band Recordings, Generic Files' });
    expect(tab).toHaveAttribute('aria-current', 'page');
    await waitFor(() => expect(tab).toHaveFocus());
  });

  it('shows a loading placeholder while the list loads', async () => {
    dockspacesStore.set({ data: undefined, isLoading: true });
    await renderApp('/dockspaces/d1/trash');

    expect(within(dockspacesNav()).getByRole('status')).toHaveTextContent('Loading dockspaces');
    expect(within(dockspacesNav()).queryByRole('button', { name: 'New dockspace' })).not.toBeInTheDocument();
  });

  it('shows the error with Try again, keeps it through the retry, then focuses New dockspace', async () => {
    dockspacesStore.set({ data: undefined, error: new Error('boom') });
    await renderApp('/dockspaces/d1/trash');

    const nav = dockspacesNav();
    expect(within(nav).getByRole('alert')).toHaveTextContent("Couldn't load dockspaces.");
    expect(within(nav).getByRole('button', { name: 'New dockspace' })).toBeInTheDocument();
    const retry = within(nav).getByRole('button', { name: 'Try again' });
    retry.focus();
    fireEvent.click(retry);
    expect(mocks.refetch).toHaveBeenCalledTimes(1);

    // React Query clears the error while it refetches a query without data.
    act(() => dockspacesStore.set({ error: null, isFetching: true }));
    expect(within(nav).getByRole('button', { name: 'Try again' })).toBe(retry);
    expect(retry).toHaveAttribute('aria-disabled', 'true');
    expect(retry).toHaveFocus();
    fireEvent.click(retry);
    expect(mocks.refetch).toHaveBeenCalledTimes(1);

    act(() => dockspacesStore.set({ data: DOCKSPACES, isFetching: false }));
    expect(within(nav).getByRole('link', { name: 'Personal Drive, Generic Files' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'New dockspace' })).toHaveFocus();
  });

  it('creates a dockspace from +, then opens it and focuses its tab', async () => {
    const created = dockspace('d7', 'Recipes');
    mocks.mutateAsync.mockImplementation(async () => {
      // The real hook resolves after the refreshed list (with the new dockspace) has loaded.
      dockspacesStore.set({ data: [...DOCKSPACES, created] });
      return created;
    });
    const router = await renderApp('/dockspaces/d1');

    const plus = within(dockspacesNav()).getByRole('button', { name: 'New dockspace' });
    fireEvent.click(plus);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Generic Files' }));

    const dialog = screen.getByRole('dialog', { name: 'Create Generic Files Dockspace' });
    fireEvent.change(within(dialog).getByLabelText('Dockspace Name'), { target: { value: 'Recipes' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Generic Dockspace' }));

    expect(await screen.findByText('Files page: d7')).toBeInTheDocument();
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ name: 'Recipes', dockspaceType: 'GENERIC_FILES' });
    expect(router.state.location.pathname).toBe('/dockspaces/d7');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const tab = within(dockspacesNav()).getByRole('link', { name: 'Recipes, Generic Files' });
    expect(tab).toHaveAttribute('aria-current', 'page');
    await waitFor(() => expect(tab).toHaveFocus());
  });

  it('returns focus to + when the create dialog is cancelled', async () => {
    await renderApp('/dockspaces/d1');

    const plus = within(dockspacesNav()).getByRole('button', { name: 'New dockspace' });
    plus.focus();
    fireEvent.click(plus);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Photos & Videos' }));
    const dialog = screen.getByRole('dialog', { name: 'Create Photos & Videos Dockspace' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(plus).toHaveFocus());
  });
});

describe('DockspaceSwitcherBar (phone)', () => {
  beforeEach(() => {
    mocks.isPhone = true;
  });

  const barButton = () => screen.getByRole('button', { name: /^Switch dockspace/ });

  it('shows the current dockspace in a bar instead of tabs', async () => {
    await renderApp('/dockspaces/d1');

    expect(screen.queryByRole('navigation', { name: 'Dockspaces' })).not.toBeInTheDocument();
    const button = barButton();
    expect(button).toHaveAccessibleName('Switch dockspace, current: Personal Drive, Generic Files');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveTextContent('6 dockspaces');
  });

  it('opens the full-screen list with the current row focused, and switches in one more tap', async () => {
    const router = await renderApp('/dockspaces/d1');

    fireEvent.click(barButton());

    const dialog = screen.getByRole('dialog', { name: 'Dockspaces' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(barButton()).toHaveAttribute('aria-expanded', 'true');
    expect(document.body.style.overflow).toBe('hidden');
    const nav = within(dialog).getByRole('navigation', { name: 'Dockspaces' });
    const current = within(nav).getByRole('link', { name: 'Personal Drive, Generic Files' });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current).toHaveFocus();
    expect(within(nav).getAllByRole('listitem')).toHaveLength(6);

    fireEvent.click(within(nav).getByRole('link', { name: 'Work Projects, Generic Files' }));

    expect(await screen.findByText('Files page: d3')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dockspaces/d3');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    await waitFor(() => expect(barButton()).toHaveFocus());
    expect(barButton()).toHaveAccessibleName('Switch dockspace, current: Work Projects, Generic Files');
  });

  it('closes on Back and on Escape without switching, returning focus to the bar', async () => {
    const router = await renderApp('/dockspaces/d1');

    fireEvent.click(barButton());
    fireEvent.click(screen.getByRole('button', { name: 'Close dockspaces' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(barButton()).toHaveFocus();

    fireEvent.click(barButton());
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(barButton()).toHaveFocus();
    expect(router.state.location.pathname).toBe('/dockspaces/d1');
  });

  it('filters the list by name', async () => {
    await renderApp('/dockspaces/d1');

    fireEvent.click(barButton());
    const dialog = screen.getByRole('dialog', { name: 'Dockspaces' });
    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Filter dockspaces' }), {
      target: { value: 'camera' }
    });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(1);
    expect(within(dialog).getByRole('link', { name: 'Camera Roll, Photos & Videos' })).toBeInTheDocument();
  });

  it('keeps the list open when Escape closes its + menu', async () => {
    await renderApp('/dockspaces/d1');

    fireEvent.click(barButton());
    const dialog = screen.getByRole('dialog', { name: 'Dockspaces' });
    const plus = within(dialog).getByRole('button', { name: 'New dockspace' });
    plus.focus();
    fireEvent.click(plus);
    expect(within(dialog).getByRole('menu', { name: 'New dockspace' })).toBeInTheDocument();

    fireEvent.keyDown(plus, { key: 'Escape' });

    expect(within(dialog).queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Dockspaces' })).toBeInTheDocument();
  });

  it('creates a dockspace from + in the list, then opens it, closes the list and focuses the bar', async () => {
    const created = dockspace('d7', 'Recipes');
    mocks.mutateAsync.mockImplementation(async () => {
      // The real hook resolves after the refreshed list (with the new dockspace) has loaded.
      dockspacesStore.set({ data: [...DOCKSPACES, created] });
      return created;
    });
    const router = await renderApp('/dockspaces/d1/trash');

    fireEvent.click(barButton());
    const list = screen.getByRole('dialog', { name: 'Dockspaces' });
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(within(list).getByRole('button', { name: 'New dockspace' }));
    fireEvent.click(within(list).getByRole('menuitem', { name: 'Generic Files' }));

    const dialog = screen.getByRole('dialog', { name: 'Create Generic Files Dockspace' });
    fireEvent.change(within(dialog).getByLabelText('Dockspace Name'), { target: { value: 'Recipes' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create Generic Dockspace' }));

    expect(await screen.findByText('Files page: d7')).toBeInTheDocument();
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ name: 'Recipes', dockspaceType: 'GENERIC_FILES' });
    expect(router.state.location.pathname).toBe('/dockspaces/d7');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe('');
    expect(barButton()).toHaveAccessibleName('Switch dockspace, current: Recipes, Generic Files');
    expect(barButton()).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(barButton()).toHaveFocus());
    expect(barButton()).toHaveTextContent('7 dockspaces');
  });

  it('returns focus to + in the list when the create dialog is cancelled, keeping the list open', async () => {
    await renderApp('/dockspaces/d1');

    fireEvent.click(barButton());
    const list = screen.getByRole('dialog', { name: 'Dockspaces' });
    const plus = within(list).getByRole('button', { name: 'New dockspace' });
    plus.focus();
    fireEvent.click(plus);
    fireEvent.click(within(list).getByRole('menuitem', { name: 'Photos & Videos' }));
    const dialog = screen.getByRole('dialog', { name: 'Create Photos & Videos Dockspace' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: 'Create Photos & Videos Dockspace' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Dockspaces' })).toBeInTheDocument();
    await waitFor(() => expect(plus).toHaveFocus());
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('shows a loading placeholder, then an error with Try again', async () => {
    dockspacesStore.set({ data: undefined, isLoading: true });
    await renderApp('/dockspaces/d1/trash');
    expect(screen.getByRole('status')).toHaveTextContent('Loading dockspaces');

    act(() => dockspacesStore.set({ isLoading: false, error: new Error('boom') }));
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load dockspaces.");
    const retry = screen.getByRole('button', { name: 'Try again' });
    retry.focus();
    fireEvent.click(retry);
    expect(mocks.refetch).toHaveBeenCalledTimes(1);

    act(() => dockspacesStore.set({ data: DOCKSPACES, error: null }));
    expect(barButton()).toHaveFocus();
  });
});
