import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaFileRecord, MediaListResponse } from '@/lib/apiTypes';
import {
  createMediaThumbnailFollowUp,
  MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS,
  type MediaGalleryData,
  pathsAwaitingThumbnail,
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

describe('pathsAwaitingThumbnail', () => {
  it('keeps only the paths loaded without a thumbnail', () => {
    const data = gallery([item('a.jpg'), item('b.jpg', true)], [item('c.mp4')]);
    expect(pathsAwaitingThumbnail(data, new Set(['/a.jpg', '/b.jpg', '/c.mp4', '/not-loaded.jpg']))).toEqual(
      new Set(['/a.jpg', '/c.mp4'])
    );
    expect(pathsAwaitingThumbnail(undefined, new Set(['/a.jpg']))).toEqual(new Set());
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
  let fetchLatest: ReturnType<typeof vi.fn<() => Promise<MediaListResponse>>>;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    fetchLatest = vi.fn<() => Promise<MediaListResponse>>();
  });

  afterEach(() => {
    vi.useRealTimers();
    client.clear();
  });

  const followUp = () => createMediaThumbnailFollowUp({ queryClient: client, queryKey, fetchLatest });
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

  it('does nothing when every uploaded item already has its thumbnail or is not loaded', async () => {
    client.setQueryData(queryKey, gallery([item('new.jpg', true)]));

    const instance = followUp();
    instance.start(['/new.jpg', '/not-loaded.jpg']);
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
});
