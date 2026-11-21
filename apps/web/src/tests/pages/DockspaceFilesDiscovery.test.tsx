import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/apiClient';
import type { DirectoryChildRecord, DirectoryChildrenRecord } from '@/lib/apiTypes';
import { clearSession, setSession } from '@/lib/authStore';
import { DockspaceFilesPage } from '@/pages/DockspaceFilesPage';
import { createTestQueryClient, QueryWrapper } from '@/tests/testUtils';

// Uses the real `useFiles` / `useDiscoverFolder` hooks and React Query, with only the API mocked, so the folder
// discovery and the folder info panel share one query cache, as in the app.

const { listFolderChildren } = vi.hoisted(() => ({
  listFolderChildren: vi.fn<(dockspaceId: string, folderNodeId: string) => Promise<DirectoryChildrenRecord>>()
}));

vi.mock('@/lib/dockspaceApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dockspaceApi')>()),
  listFolderChildren
}));

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ dockspaceId: 'v1' }),
  Link: ({ children, ...props }: { children?: unknown }) => <a {...props}>{children as any}</a>
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/hooks/useDockspaces', () => ({
  useDockspaces: () => ({
    data: [{ dockspaceId: 'v1', name: 'My Dockspace', dockspaceType: 'GENERIC_FILES' }]
  })
}));

const TIMESTAMP = '2025-09-15T12:00:00.000Z';

const child = (
  childType: 'file' | 'folder',
  childId: string,
  name: string,
  parentFolderNodeId: string
): DirectoryChildRecord => ({
  childId,
  childType,
  name,
  normalizedName: name.toLowerCase(),
  parentFolderNodeId,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
});

const TREE: Record<string, DirectoryChildRecord[]> = {
  root: [child('folder', 'd_travel', 'Travel', 'root'), child('folder', 'd_docs', 'Documents', 'root')],
  d_travel: [child('file', 'f_packing', 'packing-list.txt', 'd_travel')],
  d_docs: []
};

let failingFolderNodeIds = new Set<string>();
// Listing requests for these folders wait until the gate's promise resolves.
let heldFolderNodeIds = new Map<string, Promise<void>>();
let isPhone = false;

const holdListing = (folderNodeId: string) => {
  let release: () => void = () => {};
  heldFolderNodeIds.set(
    folderNodeId,
    new Promise<void>((resolve) => {
      release = resolve;
    })
  );
  return () => {
    heldFolderNodeIds.delete(folderNodeId);
    release();
  };
};

const callsFor = (folderNodeId: string) =>
  listFolderChildren.mock.calls.filter(([, requested]) => requested === folderNodeId).length;

/** Lets pending requests settle and effects run, so a request loop would show up in the call count. */
const settle = async () => {
  for (let round = 0; round < 10; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
};

const folderButton = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

const openInfo = (folderName: string) => {
  const trigger = screen.getByRole('button', { name: `Actions for ${folderName}` });
  trigger.focus();
  fireEvent.click(trigger);
  const item = within(screen.getByRole('menu', { name: `Actions for ${folderName}` })).getByRole('menuitem', {
    name: 'Info'
  });
  item.focus();
  fireEvent.click(item);
};

const unhandledRejections: unknown[] = [];
const onUnhandledRejection = (reason: unknown) => {
  unhandledRejections.push(reason);
};

const renderPage = () =>
  render(
    <QueryWrapper client={createTestQueryClient()}>
      <DockspaceFilesPage />
    </QueryWrapper>
  );

beforeEach(() => {
  setSession({ accessToken: 'a', idToken: 'i', email: 'a@a.com', userId: 'u1' });
  failingFolderNodeIds = new Set();
  heldFolderNodeIds = new Map();
  isPhone = false;
  unhandledRejections.length = 0;
  process.on('unhandledRejection', onUnhandledRejection);
  listFolderChildren.mockReset();
  listFolderChildren.mockImplementation(async (_dockspaceId, folderNodeId) => {
    await heldFolderNodeIds.get(folderNodeId);
    if (failingFolderNodeIds.has(folderNodeId)) {
      throw new ApiError('Request failed', 500);
    }

    return { parentFolderNodeId: folderNodeId, items: TREE[folderNodeId] ?? [] };
  });
  window.matchMedia = vi.fn((query: string) => ({
    matches: isPhone && query.includes('max-width: 900px'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  process.off('unhandledRejection', onUnhandledRejection);
  cleanup();
  clearSession();
});

describe('DockspaceFilesPage folder discovery', () => {
  it('does not request a failing folder listing again in a loop, and the folder info error stays put', async () => {
    failingFolderNodeIds = new Set(['d_travel']);
    renderPage();

    await waitFor(() => expect(folderButton('Travel')).toBeInTheDocument());
    // The healthy sibling is discovered and shows its count; the failing one is tried once.
    await waitFor(() => expect(folderButton('Documents')).toHaveTextContent('0 files'));
    await settle();
    expect(callsFor('d_travel')).toBe(1);
    expect(folderButton('Travel')).not.toHaveTextContent('file');

    openInfo('Travel');
    const panel = screen.getByRole('complementary', { name: 'Info for Travel' });
    const alert = await within(panel).findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't count what Travel contains.");
    await settle();
    const callsAfterError = callsFor('d_travel');
    // The panel's own query may ask once more when it mounts on an errored query; no more than that.
    expect(callsAfterError).toBeLessThanOrEqual(2);

    await settle();
    expect(callsFor('d_travel')).toBe(callsAfterError);
    expect(within(panel).getByRole('alert')).toHaveTextContent("Couldn't count what Travel contains.");
    expect(within(panel).queryByRole('status')).not.toBeInTheDocument();
    expect(unhandledRejections).toEqual([]);
  });

  it('Try again that fails asks once, and one that succeeds shows the counts and resumes discovery', async () => {
    failingFolderNodeIds = new Set(['d_travel']);
    renderPage();

    await waitFor(() => expect(folderButton('Travel')).toBeInTheDocument());
    openInfo('Travel');
    const panel = screen.getByRole('complementary', { name: 'Info for Travel' });
    await within(panel).findByRole('alert');
    await settle();

    const callsBeforeRetry = callsFor('d_travel');
    const tryAgain = within(panel).getByRole('button', { name: 'Try again' });
    tryAgain.focus();
    fireEvent.click(tryAgain);
    await settle();
    expect(callsFor('d_travel')).toBe(callsBeforeRetry + 1);
    expect(within(panel).getByRole('alert')).toBeInTheDocument();
    // Focus stays on Try again through a failed retry, never falling to <body>.
    expect(within(panel).getByRole('button', { name: 'Try again' })).toBe(tryAgain);
    expect(document.activeElement).toBe(tryAgain);

    failingFolderNodeIds = new Set();
    fireEvent.click(tryAgain);
    await waitFor(() => expect(within(panel).queryByRole('alert')).not.toBeInTheDocument());
    // A successful retry removes Try again: focus moves to the panel's Close button.
    expect(document.activeElement).toBe(within(panel).getByRole('button', { name: 'Close folder info' }));
    const contents = within(panel).getByRole('list', { name: 'Contents' });
    await waitFor(() => expect(contents).toHaveTextContent('0 folders'));
    expect(contents).toHaveTextContent('1 file');
    // The row's file count, filled by discovery, comes back too.
    await waitFor(() => expect(folderButton('Travel')).toHaveTextContent('1 file'));
    expect(unhandledRejections).toEqual([]);
  });

  it('gives a failed folder one new attempt after navigating', async () => {
    failingFolderNodeIds = new Set(['d_travel']);
    renderPage();

    await waitFor(() => expect(folderButton('Documents')).toHaveTextContent('0 files'));
    await settle();
    expect(callsFor('d_travel')).toBe(1);

    // Into Documents (Travel is no longer a discovery candidate) and back to the root: one new attempt, not a loop.
    fireEvent.click(folderButton('Documents'));
    await settle();
    expect(callsFor('d_travel')).toBe(1);
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Folder path' })).getByRole('button', { name: 'My Dockspace' })
    );
    await settle();
    expect(callsFor('d_travel')).toBe(2);
    await settle();
    expect(callsFor('d_travel')).toBe(2);
  });
});

describe('DockspaceFilesPage open folder listing', () => {
  const currentColumn = (name: string) => screen.getByRole('region', { name });

  const expectOnlyTheError = (column: HTMLElement) => {
    expect(within(column).getByRole('alert')).toHaveTextContent('Request failed');
    expect(within(column).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByText('This folder is empty')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload your first files' })).not.toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  };

  it.each([
    ['desktop', false],
    ['phone', true]
  ])('shows only the error with Try again when the listing fails (%s)', async (_layout, phone) => {
    isPhone = phone;
    failingFolderNodeIds = new Set(['root']);
    renderPage();

    const column = currentColumn('My Dockspace');
    await within(column).findByRole('alert');
    await settle();
    expectOnlyTheError(column);
    expect(unhandledRejections).toEqual([]);
  });

  it('shows only the error when an opened subfolder fails to load', async () => {
    failingFolderNodeIds = new Set(['d_travel']);
    renderPage();

    await waitFor(() => expect(folderButton('Travel')).toBeInTheDocument());
    fireEvent.click(folderButton('Travel'));
    const column = currentColumn('Travel');
    await within(column).findByRole('alert');
    await settle();
    expectOnlyTheError(column);
  });

  it('still shows the empty state for a folder that loads with no items', async () => {
    renderPage();

    await waitFor(() => expect(folderButton('Documents')).toBeInTheDocument());
    fireEvent.click(folderButton('Documents'));
    const column = currentColumn('Documents');
    await waitFor(() => expect(within(column).getByText('This folder is empty')).toBeInTheDocument());
    expect(within(column).getByRole('button', { name: 'Upload your first files' })).toBeInTheDocument();
    expect(within(column).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Try again keeps focus while it runs and after a failure, then shows the contents with focus on the list', async () => {
    failingFolderNodeIds = new Set(['root']);
    renderPage();

    const column = currentColumn('My Dockspace');
    await within(column).findByRole('alert');
    await settle();
    const tryAgain = within(column).getByRole('button', { name: 'Try again' });
    tryAgain.focus();

    // A retry that fails: the same button stays mounted, busy and focused while the request runs, then again.
    const callsBeforeRetry = callsFor('root');
    let release = holdListing('root');
    fireEvent.click(tryAgain);
    await waitFor(() => expect(tryAgain).toHaveTextContent('Trying again…'));
    expect(tryAgain).toHaveAttribute('aria-disabled', 'true');
    expect(within(column).getByRole('alert')).toHaveTextContent('Request failed');
    expect(document.activeElement).toBe(tryAgain);
    expectNoEmptyState();
    // A second click while busy does not start another request.
    fireEvent.click(tryAgain);
    release();
    await settle();
    expect(callsFor('root')).toBe(callsBeforeRetry + 1);
    expect(tryAgain).toHaveTextContent('Try again');
    expect(tryAgain).not.toHaveAttribute('aria-disabled');
    expect(document.activeElement).toBe(tryAgain);
    expectOnlyTheError(column);

    // A retry that succeeds: the contents replace the error, and focus moves to the folder's list, not <body>.
    failingFolderNodeIds = new Set();
    release = holdListing('root');
    fireEvent.click(tryAgain);
    await waitFor(() => expect(tryAgain).toHaveAttribute('aria-disabled', 'true'));
    expect(document.activeElement).toBe(tryAgain);
    release();
    await waitFor(() => expect(within(column).queryByRole('alert')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(column.querySelector('.dockspace-browser__list'));
    expect(folderButton('Travel')).toBeInTheDocument();
    expect(screen.queryByText('This folder is empty')).not.toBeInTheDocument();
    // Folder discovery runs for the listed folders.
    await waitFor(() => expect(folderButton('Travel')).toHaveTextContent('1 file'));
    await waitFor(() => expect(folderButton('Documents')).toHaveTextContent('0 files'));
    expect(unhandledRejections).toEqual([]);
  });

  it('shows the empty state after a successful retry of a folder that really is empty', async () => {
    failingFolderNodeIds = new Set(['d_docs']);
    renderPage();

    await waitFor(() => expect(folderButton('Documents')).toBeInTheDocument());
    fireEvent.click(folderButton('Documents'));
    const column = currentColumn('Documents');
    await within(column).findByRole('alert');
    await settle();
    const tryAgain = within(column).getByRole('button', { name: 'Try again' });
    tryAgain.focus();

    failingFolderNodeIds = new Set();
    fireEvent.click(tryAgain);
    await waitFor(() => expect(within(column).getByText('This folder is empty')).toBeInTheDocument());
    expect(within(column).queryByRole('alert')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(column.querySelector('.dockspace-browser__list'));
  });
});

const expectNoEmptyState = () => {
  expect(screen.queryByText('This folder is empty')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Upload your first files' })).not.toBeInTheDocument();
};
