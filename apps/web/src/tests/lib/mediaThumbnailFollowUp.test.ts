import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaFileRecord, MediaListResponse } from '@/lib/apiTypes';
import {
  createMediaThumbnailFollowUp,
  MEDIA_LIST_MAX_PAGE_SIZE,
  MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS,
  type MediaGalleryData,
  pathsStillFollowed,
  withNewThumbnails
} from '@/lib/mediaThumbnailFollowUp';

const queryKey = ['media', 'u1', 'v1'] as const;

const item = (name: string, thumbnail = false): MediaFileRecord => ({
  fileNodeId: `node-${name}`,
  fullPath: `/${name}`,
  size: 1,
  contentType: name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg',
  contentHash: `hash-${name}`,
  updatedAt: '2026-11-22T10:00:00.000Z',
  state: 'ACTIVE',
  ...(thumbnail ? { thumbnail: { url: `https://thumbs.example/${name}`, contentType: 'image/jpeg' } } : {})
});

const gallery = (...pages: MediaFileRecord[][]): MediaGalleryData => ({
  pages: pages.map((items, index) => ({
    items,
    ...(index < pages.length - 1 ? { nextCursor: `cursor-${index + 1}` } : {})
  })),
  pageParams: pages.map((_items, index) => (index === 0 ? undefined : `cursor-${index}`))
});

const loadedItem = (client: QueryClient, name: string) =>
  client
    .getQueryData<MediaGalleryData>(queryKey)
    ?.pages.flatMap((page) => page.items)
    .find((entry) => entry.fullPath === `/${name}`);

describe('pathsStillFollowed', () => {
  it('drops the paths loaded with a thumbnail and keeps the ones not loaded while more pages remain', () => {
    const data = gallery([item('a.jpg'), item('b.jpg', true)], [item('c.mp4')]);
    data.pages[1]!.nextCursor = 'cursor-2';
    expect(pathsStillFollowed(data, new Set(['/a.jpg', '/b.jpg', '/c.mp4', '/not-loaded.jpg']))).toEqual(
      new Set(['/a.jpg', '/c.mp4', '/not-loaded.jpg'])
    );
    expect(pathsStillFollowed(undefined, new Set(['/a.jpg']))).toEqual(new Set(['/a.jpg']));
  });

  it('drops the paths the gallery does not list once every page is loaded', () => {
    const data = gallery([item('a.jpg'), item('b.jpg', true)], [item('c.mp4')]);
    expect(pathsStillFollowed(data, new Set(['/a.jpg', '/b.jpg', '/c.mp4', '/not-listed.pdf']))).toEqual(
      new Set(['/a.jpg', '/c.mp4'])
    );
  });
});

describe('withNewThumbnails', () => {
  it('copies thumbnails onto loaded items without one and keeps everything else', () => {
    const data = gallery([item('a.jpg'), item('b.jpg', true)], [item('c.jpg')]);
    const next = withNewThumbnails(data, [item('a.jpg', true), item('new-elsewhere.jpg', true), item('c.jpg')]);

    expect(next.pages[0]?.items[0]?.thumbnail?.url).toBe('https://thumbs.example/a.jpg');
    expect(next.pages[0]?.items[1]).toBe(data.pages[0]?.items[1]);
    expect(next.pages[0]?.items.map((entry) => entry.fileNodeId)).toEqual(['node-a.jpg', 'node-b.jpg']);
    expect(next.pages[0]?.nextCursor).toBe('cursor-1');
    // No item is added: an item the gallery has not loaded stays out.
    expect(next.pages.flatMap((page) => page.items)).toHaveLength(3);
    expect(next.pages[1]).toBe(data.pages[1]);
    expect(next.pageParams).toBe(data.pageParams);
  });

  it('returns the same data when nothing changed', () => {
    const data = gallery([item('a.jpg'), item('b.jpg', true)]);
    expect(withNewThumbnails(data, [item('a.jpg'), item('b.jpg', true)])).toBe(data);
  });
});

describe('createMediaThumbnailFollowUp', () => {
  let client: QueryClient;
  type FetchPage = (options: { cursor?: string; limit: number }) => Promise<MediaListResponse>;
  let fetchLatest: ReturnType<typeof vi.fn<FetchPage>>;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    fetchLatest = vi.fn<FetchPage>();
  });

  afterEach(() => {
    vi.useRealTimers();
    client.clear();
  });

  const followUp = () => createMediaThumbnailFollowUp({ queryClient: client, queryKey, fetchPage: fetchLatest });
  const advance = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
  };

  it('fetches the newest items again until the uploaded item has its thumbnail, then stops', async () => {
    client.setQueryData(queryKey, gallery([item('new.jpg'), item('old.jpg', true)]));
    fetchLatest
      .mockResolvedValueOnce({ items: [item('new.jpg'), item('old.jpg', true)] })
      .mockResolvedValue({ items: [item('new.jpg', true), item('old.jpg', true)] });

    const instance = followUp();
    instance.start(['/new.jpg']);
    expect(fetchLatest).not.toHaveBeenCalled();

    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[0]!);
    expect(fetchLatest).toHaveBeenCalledTimes(1);
    expect(loadedItem(client, 'new.jpg')?.thumbnail).toBeUndefined();

    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[1]!);
    expect(fetchLatest).toHaveBeenCalledTimes(2);
    expect(loadedItem(client, 'new.jpg')?.thumbnail?.url).toBe('https://thumbs.example/new.jpg');

    await advance(120_000);
    expect(fetchLatest).toHaveBeenCalledTimes(2);
    instance.dispose();
  });

  it('does nothing when every uploaded item already has its thumbnail', async () => {
    client.setQueryData(queryKey, gallery([item('new.jpg', true), item('other.jpg')]));

    const instance = followUp();
    instance.start(['/new.jpg']);
    await advance(120_000);

    expect(fetchLatest).not.toHaveBeenCalled();
    instance.dispose();
  });

  it('stops after the last delay when a thumbnail never comes (e.g. a video that cannot be decoded)', async () => {
    client.setQueryData(queryKey, gallery([item('clip.mp4')]));
    fetchLatest.mockResolvedValue({ items: [item('clip.mp4')] });

    const instance = followUp();
    instance.start(['/clip.mp4']);
    await advance(10 * 60_000);

    expect(fetchLatest).toHaveBeenCalledTimes(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS.length);
    const total = MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS.reduce((sum, delay) => sum + delay, 0);
    expect(total).toBeLessThanOrEqual(60_000);
    instance.dispose();
  });

  it('keeps following the items still without a thumbnail when only some arrived', async () => {
    client.setQueryData(queryKey, gallery([item('a.jpg'), item('b.jpg')]));
    fetchLatest
      .mockResolvedValueOnce({ items: [item('a.jpg', true), item('b.jpg')] })
      .mockResolvedValue({ items: [item('a.jpg', true), item('b.jpg', true)] });

    const instance = followUp();
    instance.start(['/a.jpg', '/b.jpg']);
    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[0]!);
    expect(loadedItem(client, 'a.jpg')?.thumbnail).toBeDefined();
    expect(loadedItem(client, 'b.jpg')?.thumbnail).toBeUndefined();

    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[1]!);
    expect(loadedItem(client, 'b.jpg')?.thumbnail).toBeDefined();
    await advance(120_000);
    expect(fetchLatest).toHaveBeenCalledTimes(2);
    instance.dispose();
  });

  it('stops following an item that leaves the gallery (trashed meanwhile)', async () => {
    client.setQueryData(queryKey, gallery([item('a.jpg')]));
    fetchLatest.mockResolvedValue({ items: [] });

    const instance = followUp();
    instance.start(['/a.jpg']);
    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[0]!);
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    client.setQueryData(queryKey, gallery([]));
    await advance(120_000);
    expect(fetchLatest).toHaveBeenCalledTimes(1);
    instance.dispose();
  });

  it('keeps going after a failed request, within the same bound', async () => {
    client.setQueryData(queryKey, gallery([item('a.jpg')]));
    fetchLatest
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValue({ items: [item('a.jpg', true)] });

    const instance = followUp();
    instance.start(['/a.jpg']);
    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[0]! + MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[1]!);

    expect(fetchLatest).toHaveBeenCalledTimes(2);
    expect(loadedItem(client, 'a.jpg')?.thumbnail).toBeDefined();
    instance.dispose();
  });

  it('sends no request and writes nothing while the gallery query is fetching', async () => {
    client.setQueryData(queryKey, gallery([item('a.jpg')]));
    fetchLatest.mockResolvedValue({ items: [item('a.jpg', true)] });
    const isFetching = vi.spyOn(client, 'isFetching').mockReturnValue(1);

    const instance = followUp();
    instance.start(['/a.jpg']);
    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[0]!);
    expect(fetchLatest).not.toHaveBeenCalled();

    isFetching.mockReturnValue(0);
    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[1]!);
    expect(fetchLatest).toHaveBeenCalledTimes(1);
    expect(loadedItem(client, 'a.jpg')?.thumbnail).toBeDefined();
    instance.dispose();
  });

  it('does not write a response that lands while the gallery query started fetching', async () => {
    client.setQueryData(queryKey, gallery([item('a.jpg')]));
    let resolveLatest: (value: MediaListResponse) => void = () => {};
    fetchLatest.mockImplementationOnce(
      async () =>
        await new Promise<MediaListResponse>((resolve) => {
          resolveLatest = resolve;
        })
    );
    fetchLatest.mockResolvedValue({ items: [item('a.jpg', true)] });
    const isFetching = vi.spyOn(client, 'isFetching');

    const instance = followUp();
    instance.start(['/a.jpg']);
    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[0]!);
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    isFetching.mockReturnValue(1);
    resolveLatest({ items: [item('a.jpg', true)] });
    await advance(0);
    expect(loadedItem(client, 'a.jpg')?.thumbnail).toBeUndefined();

    // The gallery fetch settles still without the thumbnail: the next round writes it.
    isFetching.mockReturnValue(0);
    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[1]!);
    expect(fetchLatest).toHaveBeenCalledTimes(2);
    expect(loadedItem(client, 'a.jpg')?.thumbnail).toBeDefined();
    instance.dispose();
  });

  it('restarts the bound for a new batch and follows both batches with one chain of requests', async () => {
    client.setQueryData(queryKey, gallery([item('a.jpg')]));
    fetchLatest.mockResolvedValue({ items: [item('b.jpg'), item('a.jpg')] });

    const instance = followUp();
    instance.start(['/a.jpg']);
    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[0]!);
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    client.setQueryData(queryKey, gallery([item('b.jpg'), item('a.jpg')]));
    instance.start(['/b.jpg']);
    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[0]!);
    expect(fetchLatest).toHaveBeenCalledTimes(2);

    await advance(10 * 60_000);
    // One full bound from the second start, not two interleaved chains.
    expect(fetchLatest).toHaveBeenCalledTimes(1 + MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS.length);
    instance.dispose();
  });

  it('a start while a request is in flight does not leave two chains running', async () => {
    client.setQueryData(queryKey, gallery([item('a.jpg')]));
    let resolveLatest: (value: MediaListResponse) => void = () => {};
    fetchLatest.mockImplementationOnce(
      async () =>
        await new Promise<MediaListResponse>((resolve) => {
          resolveLatest = resolve;
        })
    );
    fetchLatest.mockResolvedValue({ items: [item('a.jpg')] });

    const instance = followUp();
    instance.start(['/a.jpg']);
    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[0]!);
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    instance.start(['/a.jpg']);
    resolveLatest({ items: [item('a.jpg')] });
    await advance(10 * 60_000);
    expect(fetchLatest).toHaveBeenCalledTimes(1 + MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS.length);
    instance.dispose();
  });

  it('keeps a path added by a new batch that a request sent before that batch did not list', async () => {
    client.setQueryData(queryKey, gallery([item('a.jpg')]));
    let resolveLatest: (value: MediaListResponse) => void = () => {};
    fetchLatest.mockImplementationOnce(
      async () =>
        await new Promise<MediaListResponse>((resolve) => {
          resolveLatest = resolve;
        })
    );
    fetchLatest.mockResolvedValue({ items: [item('b.jpg', true), item('a.jpg', true)] });

    const instance = followUp();
    instance.start(['/a.jpg']);
    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[0]!);
    expect(fetchLatest).toHaveBeenCalledTimes(1);

    // A second batch lands while that request is in flight; its response predates b.jpg.
    client.setQueryData(queryKey, gallery([item('b.jpg'), item('a.jpg')]));
    instance.start(['/b.jpg']);
    // a.jpg is done; b.jpg is only missing from a listing older than it.
    resolveLatest({ items: [item('a.jpg', true)] });
    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[0]!);

    expect(fetchLatest).toHaveBeenCalledTimes(2);
    expect(loadedItem(client, 'b.jpg')?.thumbnail).toBeDefined();
    instance.dispose();
  });

  it('sends nothing and writes nothing after dispose', async () => {
    client.setQueryData(queryKey, gallery([item('a.jpg')]));
    let resolveLatest: (value: MediaListResponse) => void = () => {};
    fetchLatest.mockImplementationOnce(
      async () =>
        await new Promise<MediaListResponse>((resolve) => {
          resolveLatest = resolve;
        })
    );

    const instance = followUp();
    instance.start(['/a.jpg']);
    await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[0]!);
    instance.dispose();
    resolveLatest({ items: [item('a.jpg', true)] });
    await advance(10 * 60_000);

    expect(fetchLatest).toHaveBeenCalledTimes(1);
    expect(loadedItem(client, 'a.jpg')?.thumbnail).toBeUndefined();
    instance.start(['/a.jpg']);
    await advance(10 * 60_000);
    expect(fetchLatest).toHaveBeenCalledTimes(1);
  });

  describe('batches larger than one gallery page', () => {
    const BASE_TIME = Date.UTC(2026, 10, 22, 12, 0, 0);
    // The listing is newest first: index 0 is the most recently updated item.
    const listed = (name: string, index: number, thumbnail = false): MediaFileRecord => ({
      ...item(name, thumbnail),
      updatedAt: new Date(BASE_TIME - index * 1000).toISOString()
    });
    const uploadName = (index: number) => `upload-${String(index).padStart(3, '0')}.jpg`;
    const uploadPaths = (count: number) => Array.from({ length: count }, (_, index) => `/${uploadName(index)}`);
    /** `count` uploads followed by `older` items that already had a thumbnail. */
    const library = (count: number, older: number, hasThumbnail: (index: number) => boolean) => [
      ...Array.from({ length: count }, (_, index) => listed(uploadName(index), index, hasThumbnail(index))),
      ...Array.from({ length: older }, (_, index) => listed(`older-${index}.jpg`, count + index, true))
    ];
    /** Serves `GET /media` pages over `items()` the way the API does: a cursor, at most `limit` items. */
    const serveListing =
      (items: () => MediaFileRecord[]): FetchPage =>
      async ({ cursor, limit }) => {
        const all = items();
        const start = cursor ? Number(cursor) : 0;
        const pageItems = all.slice(start, start + limit);
        const end = start + pageItems.length;
        return { items: pageItems, ...(end < all.length ? { nextCursor: String(end) } : {}) };
      };
    /** The gallery as useMediaFiles loads it: pages of 120, the first `pageCount` of them. */
    const loadedGallery = (items: MediaFileRecord[], pageCount: number): MediaGalleryData => ({
      pages: Array.from({ length: pageCount }, (_, index) => ({
        items: items.slice(index * 120, (index + 1) * 120),
        ...((index + 1) * 120 < items.length ? { nextCursor: String((index + 1) * 120) } : {})
      })),
      pageParams: Array.from({ length: pageCount }, (_, index) => (index === 0 ? undefined : String(index * 120)))
    });
    const loadedUploads = () =>
      client
        .getQueryData<MediaGalleryData>(queryKey)!
        .pages.flatMap((page) => page.items)
        .filter((entry) => entry.fullPath.startsWith('/upload-'));

    it('covers every upload of a batch larger than the API page, in one walk of the newest items per round', async () => {
      let round = 0;
      fetchLatest.mockImplementation(
        serveListing(() => library(250, 50, () => round >= 2))
      );
      client.setQueryData(queryKey, loadedGallery(library(250, 50, () => false), 3));
      expect(loadedUploads()).toHaveLength(250);

      const instance = followUp();
      instance.start(uploadPaths(250));
      round = 1;
      await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[0]!);
      expect(fetchLatest.mock.calls.map(([options]) => options)).toEqual([
        { limit: MEDIA_LIST_MAX_PAGE_SIZE },
        { cursor: '200', limit: MEDIA_LIST_MAX_PAGE_SIZE }
      ]);
      expect(loadedUploads().some((entry) => entry.thumbnail)).toBe(false);

      round = 2;
      await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[1]!);
      expect(fetchLatest).toHaveBeenCalledTimes(4);
      expect(loadedUploads().every((entry) => entry.thumbnail)).toBe(true);
      // The loaded pages keep their items, order and cursors.
      expect(client.getQueryData<MediaGalleryData>(queryKey)!.pages.map((page) => page.nextCursor)).toEqual([
        '120',
        '240',
        undefined
      ]);

      await advance(10 * 60_000);
      expect(fetchLatest).toHaveBeenCalledTimes(4);
      instance.dispose();
    });

    it('sizes the request to the batch: 130 uploads are one request of 130', async () => {
      fetchLatest.mockImplementation(serveListing(() => library(130, 20, () => true)));
      client.setQueryData(queryKey, loadedGallery(library(130, 20, () => false), 2));

      const instance = followUp();
      instance.start(uploadPaths(130));
      await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[0]!);
      expect(fetchLatest.mock.calls.map(([options]) => options)).toEqual([{ limit: 130 }]);
      expect(loadedUploads()).toHaveLength(130);
      expect(loadedUploads().every((entry) => entry.thumbnail)).toBe(true);

      await advance(10 * 60_000);
      expect(fetchLatest).toHaveBeenCalledTimes(1);
      instance.dispose();
    });

    it('gives an upload loaded by scrolling after the batch refresh its thumbnail', async () => {
      let round = 0;
      // The first 120 uploads get their thumbnail by round 1, the last 10 only from round 3.
      const hasThumbnail = (index: number) => round >= (index < 120 ? 1 : 3);
      fetchLatest.mockImplementation(serveListing(() => library(130, 20, hasThumbnail)));
      // The batch refresh loaded the first page only: uploads 120-129 are not loaded.
      client.setQueryData(queryKey, loadedGallery(library(130, 20, () => false), 1));

      const instance = followUp();
      instance.start(uploadPaths(130));
      round = 1;
      await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[0]!);
      expect(loadedUploads()).toHaveLength(120);
      expect(loadedUploads().every((entry) => entry.thumbnail)).toBe(true);

      // The user scrolls: the next page loads uploads 120-129, still without a thumbnail.
      round = 2;
      client.setQueryData(queryKey, loadedGallery(library(130, 20, hasThumbnail), 2));
      expect(loadedUploads().filter((entry) => !entry.thumbnail)).toHaveLength(10);
      await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[1]!);
      expect(loadedUploads().filter((entry) => !entry.thumbnail)).toHaveLength(10);

      round = 3;
      await advance(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS[2]!);
      expect(loadedUploads()).toHaveLength(130);
      expect(loadedUploads().every((entry) => entry.thumbnail)).toBe(true);

      const callsWhenShown = fetchLatest.mock.calls.length;
      expect(callsWhenShown).toBe(3);
      await advance(10 * 60_000);
      expect(fetchLatest).toHaveBeenCalledTimes(callsWhenShown);
      instance.dispose();
    });

    it('stops early once the uploads not loaded have their thumbnail too', async () => {
      fetchLatest.mockImplementation(serveListing(() => library(130, 20, () => true)));
      client.setQueryData(queryKey, loadedGallery(library(130, 20, () => false), 1));

      const instance = followUp();
      instance.start(uploadPaths(130));
      await advance(10 * 60_000);

      expect(fetchLatest).toHaveBeenCalledTimes(1);
      instance.dispose();
    });

    it('stays bounded when an upload that is not loaded never gets a thumbnail', async () => {
      fetchLatest.mockImplementation(serveListing(() => library(130, 20, (index) => index < 129)));
      client.setQueryData(queryKey, loadedGallery(library(130, 20, () => false), 1));

      const instance = followUp();
      instance.start(uploadPaths(130));
      await advance(10 * 60_000);

      expect(fetchLatest).toHaveBeenCalledTimes(MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS.length);
      instance.dispose();
    });

    it('stops following an upload trashed from a long listing once a round walks past it', async () => {
      const others = Array.from({ length: 500 }, (_, index) => listed(`older-${index}.jpg`, index + 1, true));
      client.setQueryData(queryKey, loadedGallery([listed('a.jpg', 0), ...others], 1));
      const instance = followUp();
      instance.start(['/a.jpg']);

      // Trashed before the first round: the listing and the refreshed gallery no longer have it.
      fetchLatest.mockImplementation(serveListing(() => others));
      client.setQueryData(queryKey, loadedGallery(others, 1));
      await advance(10 * 60_000);

      expect(fetchLatest.mock.calls.map(([options]) => options)).toEqual([{ limit: 120 }]);
      instance.dispose();
    });

    it('stops following an upload a full walk does not find (not media, or gone)', async () => {
      const others = Array.from({ length: 1000 }, (_, index) => listed(`older-${index}.jpg`, index, true));
      fetchLatest.mockImplementation(serveListing(() => others));
      client.setQueryData(queryKey, loadedGallery(others, 1));

      const instance = followUp();
      instance.start(['/missing.jpg']);
      await advance(10 * 60_000);

      // One round of two pages of 120: the batch fits in one, plus one for items listed above it since.
      expect(fetchLatest.mock.calls.map(([options]) => options)).toEqual([
        { limit: 120 },
        { cursor: '120', limit: 120 }
      ]);
      instance.dispose();
    });
  });
});
