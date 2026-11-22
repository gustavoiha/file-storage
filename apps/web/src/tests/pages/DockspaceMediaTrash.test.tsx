import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DockspaceMediaPage } from '@/pages/DockspaceMediaPage';
import { ApiError } from '@/lib/apiClient';
import { clearSession, setSession } from '@/lib/authStore';
import type { MediaFileRecord, MediaListResponse } from '@/lib/apiTypes';
import { createTestQueryClient, QueryWrapper } from '@/tests/testUtils';

// Move to trash from the gallery, through the real React Query hooks (useMediaFiles, useTrashFilesBatch) with the API
// mocked. The gallery refetch that follows a trash re-requests every loaded page, one after another: the dialog must
// not wait for it (T-0034).
const api = vi.hoisted(() => ({
  pages: new Map<string | undefined, () => Promise<MediaListResponse>>(),
  trashed: new Set<string>(),
  failingPaths: new Set<string>(),
  listMedia: vi.fn(),
  moveToTrash: vi.fn()
}));

const buildItems = (start: number, count: number): MediaFileRecord[] =>
  Array.from({ length: count }, (_, offset) => {
    const n = String(start + offset).padStart(4, '0');
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
  listAlbums: vi.fn(async () => []),
  listAlbumMedia: vi.fn(async () => []),
  listMediaAlbums: vi.fn(async () => []),
  listMediaDuplicates: vi.fn(async () => ({
    items: [],
    summary: { groupCount: 0, duplicateItemCount: 0, reclaimableBytes: 0 }
  }))
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

/** Two pages of 8 items (c1 is the second); trashed items are left out of later responses, as the API does. */
const serveTwoPages = () => {
  api.pages.clear();
  api.pages.set(undefined, async () => ({ items: buildItems(0, 8), nextCursor: 'c1' }));
  api.pages.set('c1', async () => ({ items: buildItems(8, 8) }));
};

/** Every gallery request from now on waits until the returned release function is called. */
const holdGalleryRequests = () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const previous = api.listMedia.getMockImplementation();
  api.listMedia.mockImplementation(async (...args: unknown[]) => {
    await gate;
    return previous?.(...args);
  });
  return () => act(() => release());
};

const renderPage = () =>
  render(
    <QueryWrapper client={createTestQueryClient()}>
      <DockspaceMediaPage dockspaceId="dock-1" dockspaceName="Camera Roll" />
    </QueryWrapper>
  );

const trashTiles = (...names: string[]) => {
  fireEvent.click(screen.getByRole('button', { name: 'Select multiple' }));
  for (const name of names) {
    fireEvent.click(screen.getByRole('button', { name: `Select ${name}` }));
  }
  fireEvent.click(screen.getByRole('button', { name: 'Trash selected' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));
};

describe('Move to trash from the gallery', () => {
  beforeEach(() => {
    setSession({ accessToken: 'a', idToken: 'i', email: 'a@a.com', userId: 'u1' });
    api.trashed.clear();
    api.failingPaths.clear();
    api.listMedia.mockReset();
    api.listMedia.mockImplementation(async (_dockspaceId: string, options?: { cursor?: string }) => {
      const page = api.pages.get(options?.cursor);
      if (!page) throw new Error(`unexpected cursor ${options?.cursor}`);
      const response = await page();
      return { ...response, items: response.items.filter((item) => !api.trashed.has(item.fullPath)) };
    });
    api.moveToTrash.mockReset();
    api.moveToTrash.mockImplementation(async (_dockspaceId: string, { fullPath }: { fullPath: string }) => {
      if (api.failingPaths.has(fullPath)) {
        throw new ApiError('Storage unavailable', 500);
      }
      api.trashed.add(fullPath);
    });
    serveTwoPages();
  });

  afterEach(() => {
    cleanup();
    clearSession();
  });

  it('closes the dialog, clears the selection and removes the tiles while the gallery refetch is still running', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Open item-0015.jpg' });
    expect(api.listMedia).toHaveBeenCalledTimes(2);

    const release = holdGalleryRequests();
    trashTiles('item-0001.jpg', 'item-0009.jpg');

    // The dialog closes as soon as the trash requests succeed, with the refetch of the first page still held.
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Confirm moving items to trash' })).not.toBeInTheDocument()
    );
    expect(api.moveToTrash).toHaveBeenCalledTimes(2);
    expect(api.listMedia).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('alert')).toHaveTextContent('Moved 2 items to trash.');
    // The selection is cleared and selection mode ends.
    expect(screen.queryByRole('button', { name: 'Trash selected' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select multiple' })).toBeInTheDocument();
    // The trashed tiles left both loaded pages without waiting for the refetch; the others stay.
    expect(screen.queryByRole('button', { name: 'Open item-0001.jpg' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open item-0009.jpg' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open item-0000.jpg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open item-0015.jpg' })).toBeInTheDocument();

    // The refetch then completes in the background (both pages again) and the trashed items stay gone.
    await release();
    await waitFor(() => expect(api.listMedia).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expect(api.listMedia.mock.calls.map(([, options]) => options?.cursor)).toEqual([
        undefined,
        'c1',
        undefined,
        'c1'
      ])
    );
    expect(screen.queryByRole('button', { name: 'Open item-0001.jpg' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open item-0009.jpg' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open item-0015.jpg' })).toBeInTheDocument();
  });

  it('keeps an item whose trash request failed in the gallery and reports the failure', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Open item-0015.jpg' });
    api.failingPaths.add('/photos/item-0002.jpg');

    const release = holdGalleryRequests();
    trashTiles('item-0001.jpg', 'item-0002.jpg');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Moved 1 items to trash. 1 failed.'));
    expect(screen.queryByRole('button', { name: 'Open item-0001.jpg' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open item-0002.jpg' })).toBeInTheDocument();

    await release();
    await waitFor(() => expect(api.listMedia).toHaveBeenCalledTimes(4));
    expect(screen.getByRole('button', { name: 'Open item-0002.jpg' })).toBeInTheDocument();
  });
});
