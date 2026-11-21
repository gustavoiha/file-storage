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
  unhandledRejections.length = 0;
  process.on('unhandledRejection', onUnhandledRejection);
  listFolderChildren.mockReset();
  listFolderChildren.mockImplementation(async (_dockspaceId, folderNodeId) => {
    if (failingFolderNodeIds.has(folderNodeId)) {
      throw new ApiError('Request failed', 500);
    }

    return { parentFolderNodeId: folderNodeId, items: TREE[folderNodeId] ?? [] };
  });
  window.matchMedia = vi.fn((query: string) => ({
    matches: false,
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
    fireEvent.click(within(panel).getByRole('button', { name: 'Try again' }));
    await settle();
    expect(callsFor('d_travel')).toBe(callsBeforeRetry + 1);
    expect(within(panel).getByRole('alert')).toBeInTheDocument();

    failingFolderNodeIds = new Set();
    fireEvent.click(within(panel).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(within(panel).queryByRole('alert')).not.toBeInTheDocument());
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
