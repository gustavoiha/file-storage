import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DockspaceMediaPage } from '@/pages/DockspaceMediaPage';
import { ApiError } from '@/lib/apiClient';
import { clearSession, setSession } from '@/lib/authStore';
import type { AlbumRecord, MediaDuplicatesResponse, MediaFileRecord } from '@/lib/apiTypes';
import { createTestQueryClient, QueryWrapper } from '@/tests/testUtils';

// T-0040: the gallery's Move to trash dialog (Trash selected, and Move selected to trash in Find duplicates) takes
// focus on Cancel when it opens, keeps Tab inside, and leaves focus on a stable control after a confirmed trash.
const api = vi.hoisted(() => ({
  trashed: new Set<string>(),
  failingPaths: new Set<string>(),
  albums: [] as AlbumRecord[],
  /** While set, every trash request waits for it. */
  trashGate: null as Promise<void> | null,
  listMedia: vi.fn(),
  listMediaDuplicates: vi.fn(),
  moveToTrash: vi.fn()
}));

const buildItems = (count: number): MediaFileRecord[] =>
  Array.from({ length: count }, (_, index) => {
    const n = String(index).padStart(4, '0');
    return {
      fileNodeId: `file-${n}`,
      fullPath: `/photos/item-${n}.jpg`,
      size: 1_000,
      contentType: 'image/jpeg',
      contentHash: `hash-${n}`,
      updatedAt: '2026-02-01T00:00:00.000Z',
      state: 'ACTIVE'
    };
  });

vi.mock('@/lib/dockspaceApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dockspaceApi')>()),
  listMedia: api.listMedia,
  moveToTrash: api.moveToTrash,
  listTrash: vi.fn(async () => []),
  listAlbums: vi.fn(async () => api.albums),
  listAlbumMedia: vi.fn(async () => []),
  listMediaAlbums: vi.fn(async () => []),
  listMediaDuplicates: api.listMediaDuplicates
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children?: unknown }) => <a>{children as any}</a>
}));

vi.mock('@/components/auth/RequireAuth', () => ({
  RequireAuth: ({ children }: { children?: unknown }) => <>{children as any}</>
}));

vi.mock('@/components/files/FileViewerDialog', () => ({
  FileViewerDialog: () => null
}));

vi.mock('@/components/files/UploadStagingList', () => ({
  UploadStagingList: () => null
}));

vi.mock('@/hooks/useDockspaceUploadDialog', () => ({
  useDockspaceUploadDialog: () => ({
    clearValidationError: vi.fn(),
    validationError: null,
    stageFiles: vi.fn(),
    activeUploads: [],
    retryUpload: vi.fn(),
    skippedUploads: [],
    clearSkippedUploads: vi.fn()
  })
}));

const BOX_WIDTH = 800;
const BOX_HEIGHT = 600;
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
const originalInnerHeight = window.innerHeight;
const originalMatchMedia = window.matchMedia;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return (this as HTMLElement).classList.contains('media-grid-virtual') ? BOX_WIDTH : 0;
    }
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return (this as HTMLElement).classList.contains('media-grid-virtual') ? BOX_HEIGHT : 0;
    }
  });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
});

afterAll(() => {
  if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
  if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
});

const useLayout = (layout: 'desktop' | 'phone') => {
  window.matchMedia = vi.fn((query: string) => ({
    matches: layout === 'phone' && query.includes('max-width: 900px'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  })) as unknown as typeof window.matchMedia;
};

/** Trash requests from now on wait until the returned release function is called. */
const holdTrashRequests = () => {
  let release!: () => void;
  api.trashGate = new Promise<void>((resolve) => (release = resolve));
  return async () => {
    await act(async () => {
      release();
      api.trashGate = null;
    });
  };
};

const duplicateItem = (name: string, contentHash: string, size: number): MediaFileRecord => ({
  fileNodeId: `node-${name}`,
  fullPath: `/photos/${name}.jpg`,
  size,
  contentType: 'image/jpeg',
  contentHash,
  updatedAt: '2026-02-01T00:00:00.000Z',
  state: 'ACTIVE'
});

/** Two duplicate groups built from the files not trashed yet; the first file is the default keeper. */
const serveDuplicateGroups = async (): Promise<MediaDuplicatesResponse> => {
  const items = [
    ['a-0', 'a-1'].map((name) => duplicateItem(name, 'aaaaaaaaaaaaaaaa', 100)),
    ['b-0', 'b-1'].map((name) => duplicateItem(name, 'bbbbbbbbbbbbbbbb', 200))
  ]
    .map((files) => files.filter((file) => !api.trashed.has(file.fullPath)))
    .filter((files) => files.length >= 2)
    .map((files) => {
      const totalGroupSizeBytes = files.reduce((sum, file) => sum + file.size, 0);
      return {
        contentHash: files[0]!.contentHash,
        items: files,
        duplicateCount: files.length - 1,
        totalGroupSizeBytes,
        reclaimableBytes: totalGroupSizeBytes - files[0]!.size,
        defaultKeeperFileNodeId: files[0]!.fileNodeId
      };
    });

  return {
    items,
    summary: {
      groupCount: items.length,
      duplicateItemCount: items.reduce((sum, group) => sum + group.duplicateCount, 0),
      reclaimableBytes: items.reduce((sum, group) => sum + group.reclaimableBytes, 0)
    }
  };
};

const renderPage = () =>
  render(
    <QueryWrapper client={createTestQueryClient()}>
      <DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />
    </QueryWrapper>
  );

const trashDialog = () => screen.queryByRole('dialog', { name: 'Confirm moving items to trash' });

/** A keyboard activation: the button holds focus when it is clicked. */
const press = (button: HTMLElement) => {
  button.focus();
  fireEvent.click(button);
};

/**
 * jsdom keeps focus on a button that becomes disabled; a browser drops it to <body>. Simulate the browser so the
 * tests see focus on <body> while the request runs (as in TrashPage.test.tsx).
 */
let blurOnDisable: MutationObserver | undefined;

beforeEach(() => {
  setSession({ accessToken: 'a', idToken: 'i', email: 'a@a.com', userId: 'u1' });
  api.trashed.clear();
  api.failingPaths.clear();
  api.albums = [];
  api.trashGate = null;
  api.listMedia.mockReset();
  api.listMedia.mockImplementation(async () => ({
    items: buildItems(6).filter((item) => !api.trashed.has(item.fullPath))
  }));
  api.listMediaDuplicates.mockReset();
  api.listMediaDuplicates.mockImplementation(serveDuplicateGroups);
  api.moveToTrash.mockReset();
  api.moveToTrash.mockImplementation(async (_dockspaceId: string, { fullPath }: { fullPath: string }) => {
    if (api.trashGate) {
      await api.trashGate;
    }
    if (api.failingPaths.has(fullPath)) {
      throw new ApiError('Storage unavailable', 500);
    }
    api.trashed.add(fullPath);
  });
  blurOnDisable = new MutationObserver(() => {
    const active = document.activeElement;
    if (active instanceof HTMLButtonElement && active.disabled) {
      active.disabled = false;
      active.blur();
      active.disabled = true;
    }
  });
  blurOnDisable.observe(document.body, { attributes: true, attributeFilter: ['disabled'], subtree: true });
});

afterEach(() => {
  blurOnDisable?.disconnect();
  cleanup();
  clearSession();
  window.matchMedia = originalMatchMedia;
});

describe.each(['desktop', 'phone'] as const)('Gallery Trash selected dialog focus (%s)', (layout) => {
  beforeEach(() => {
    useLayout(layout);
  });

  const startSelection = () => {
    if (layout === 'phone') {
      fireEvent.click(screen.getByRole('button', { name: 'Gallery options' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Select items' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Select multiple' }));
    }
  };

  const openTrashDialog = async (...names: string[]) => {
    renderPage();
    await screen.findByRole('button', { name: 'Open item-0005.jpg' });
    startSelection();
    for (const name of names) {
      fireEvent.click(screen.getByRole('button', { name: `Select ${name}` }));
    }
    const opener = screen.getByRole('button', { name: 'Trash selected' });
    press(opener);
    const dialog = trashDialog();
    expect(dialog).not.toBeNull();
    return { opener, dialog: dialog as HTMLElement };
  };

  it('puts focus on Cancel when it opens and keeps Tab and Shift+Tab inside', async () => {
    const user = userEvent.setup();
    const { dialog } = await openTrashDialog('item-0001.jpg');
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const confirm = within(dialog).getByRole('button', { name: 'Move to trash' });

    expect(cancel).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
  });

  it('keeps Tab inside while Moving... runs, then moves focus to the album button after the trash', async () => {
    const user = userEvent.setup();
    const { dialog } = await openTrashDialog('item-0001.jpg', 'item-0002.jpg');
    const release = holdTrashRequests();

    press(within(dialog).getByRole('button', { name: 'Move to trash' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Moving...' })).toBeDisabled());
    // The disabled button dropped focus to <body>; Tab brings it back into the dialog, not to the page behind.
    expect(document.activeElement).toBe(document.body);
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });

    await release();
    await waitFor(() => expect(trashDialog()).toBeNull());
    expect(screen.getByRole('alert')).toHaveTextContent('Moved 2 items to trash.');
    // Selection mode ended and Trash selected is gone: the album button that replaced the selection bar has focus.
    expect(screen.queryByRole('button', { name: 'Trash selected' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Album: All media' })).toHaveFocus());
  });

  it('moves focus to the album button when Cancel held focus as the trash completed', async () => {
    const { dialog } = await openTrashDialog('item-0003.jpg');
    const release = holdTrashRequests();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Move to trash' }));
    act(() => {
      within(dialog).getByRole('button', { name: 'Cancel' }).focus();
    });
    await release();

    await waitFor(() => expect(trashDialog()).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Album: All media' })).toHaveFocus());
    expect(document.activeElement).not.toBe(document.body);
  });

  it.each([
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['Cancel', () => fireEvent.click(within(trashDialog()!).getByRole('button', { name: 'Cancel' }))],
    [
      'the backdrop',
      () => fireEvent.mouseDown(trashDialog()!.closest('.dockspace-dialog-backdrop') as HTMLElement)
    ]
  ])('returns focus to Trash selected when closed with %s', async (_name, close) => {
    const { opener } = await openTrashDialog('item-0001.jpg');

    close();
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });

    expect(trashDialog()).toBeNull();
    await waitFor(() => expect(opener).toHaveFocus());
    expect(api.moveToTrash).not.toHaveBeenCalled();
  });
});

describe('Find duplicates Move selected to trash dialog focus', () => {
  const openDuplicates = async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Open item-0005.jpg' });
    fireEvent.click(screen.getByRole('button', { name: 'Gallery options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Find duplicates' }));
    await screen.findByText('Hash aaaaaaaaaaaa...');
    expect(screen.getByText('2 items selected for trash.')).toBeInTheDocument();
  };

  const openTrashDialog = () => {
    const opener = screen.getByRole('button', { name: 'Move selected to trash' });
    press(opener);
    const dialog = trashDialog();
    expect(dialog).not.toBeNull();
    return { opener, dialog: dialog as HTMLElement };
  };

  it('puts focus on Cancel when it opens and keeps Tab and Shift+Tab inside', async () => {
    const user = userEvent.setup();
    await openDuplicates();
    const { dialog } = openTrashDialog();
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const confirm = within(dialog).getByRole('button', { name: 'Move to trash' });

    expect(cancel).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
  });

  it('moves focus to the duplicates summary when the trash leaves nothing selected', async () => {
    const user = userEvent.setup();
    await openDuplicates();
    const { dialog } = openTrashDialog();
    const release = holdTrashRequests();

    press(within(dialog).getByRole('button', { name: 'Move to trash' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Moving...' })).toBeDisabled());
    expect(document.activeElement).toBe(document.body);
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });

    await release();
    await waitFor(() => expect(trashDialog()).toBeNull());
    expect(screen.getByRole('button', { name: 'Move selected to trash' })).toBeDisabled();
    const summary = document.querySelector<HTMLElement>('.media-duplicates__summary');
    await waitFor(() => expect(document.activeElement).toBe(summary));
    expect(summary).toHaveAttribute('tabindex', '-1');
    expect(summary).toHaveTextContent('0 duplicate groups found.');
  });

  it('returns focus to Move selected to trash when a failed file is still selected', async () => {
    await openDuplicates();
    api.failingPaths.add('/photos/b-1.jpg');
    const { opener, dialog } = openTrashDialog();

    press(within(dialog).getByRole('button', { name: 'Move to trash' }));

    await waitFor(() => expect(trashDialog()).toBeNull());
    expect(screen.getByRole('alert')).toHaveTextContent('Moved 1 items to trash. 1 failed.');
    expect(screen.getByText('1 items selected for trash.')).toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it.each([
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['Cancel', () => fireEvent.click(within(trashDialog()!).getByRole('button', { name: 'Cancel' }))],
    [
      'the backdrop',
      () => fireEvent.mouseDown(trashDialog()!.closest('.dockspace-dialog-backdrop') as HTMLElement)
    ]
  ])('returns focus to Move selected to trash when closed with %s', async (_name, close) => {
    await openDuplicates();
    const { opener } = openTrashDialog();

    close();
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });

    expect(trashDialog()).toBeNull();
    await waitFor(() => expect(opener).toHaveFocus());
    expect(api.moveToTrash).not.toHaveBeenCalled();
  });
});

describe('Gallery Add to album dialog Tab trap', () => {
  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup();
    useLayout('desktop');
    api.albums = [{ albumId: 'album-1', name: 'Travel' } as AlbumRecord];
    renderPage();
    await screen.findByRole('button', { name: 'Open item-0005.jpg' });
    fireEvent.click(screen.getByRole('button', { name: 'Select multiple' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select item-0001.jpg' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add to album' })).toBeEnabled());
    press(screen.getByRole('button', { name: 'Add to album' }));

    const dialog = screen.getByRole('dialog', { name: 'Add selected media to album' });
    const select = within(dialog).getByRole('combobox', { name: 'Album' });
    const submit = within(dialog).getByRole('button', { name: 'Add selected items' });
    expect(select).toHaveFocus();

    await user.tab({ shift: true });
    expect(submit).toHaveFocus();
    await user.tab();
    expect(select).toHaveFocus();
  });
});
