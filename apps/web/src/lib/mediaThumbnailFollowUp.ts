import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import type { MediaFileRecord, MediaListResponse } from '@/lib/apiTypes';

/** The media gallery's cached data: the loaded pages of `GET /media`. */
export type MediaGalleryData = InfiniteData<MediaListResponse, string | undefined>;

/**
 * Waits before each follow-up request for new uploads' thumbnails (about a minute in all). Thumbnails are made by
 * an asynchronous job after the upload, so the gallery refresh at the end of a batch usually lists new items without
 * one. The list is the bound: once it runs out, the follow-up stops even if some thumbnail never came (a video that
 * cannot be decoded, a failed job); a reload or a later refetch still shows it.
 */
export const MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS: readonly number[] = [
  1500, 2000, 3000, 4000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000
];

/**
 * The paths among `paths` whose item in the loaded gallery has no thumbnail yet. A path with no loaded item (not on
 * a loaded page, or trashed since) is left out: there is no tile to update.
 */
export const pathsAwaitingThumbnail = (
  data: MediaGalleryData | undefined,
  paths: ReadonlySet<string>
): Set<string> => {
  const awaiting = new Set<string>();
  if (!data || paths.size === 0) {
    return awaiting;
  }

  for (const page of data.pages) {
    for (const item of page.items) {
      if (!item.thumbnail && paths.has(item.fullPath)) {
        awaiting.add(item.fullPath);
      }
    }
  }

  return awaiting;
};

/**
 * Copies the thumbnail of each item in `latestItems` onto the loaded gallery item with the same file node id when
 * that one has none. Nothing else changes: no item is added, removed or moved, so the loaded pages and their
 * cursors stay as they are. Returns `data` itself when no item changed.
 */
export const withNewThumbnails = (
  data: MediaGalleryData,
  latestItems: readonly MediaFileRecord[]
): MediaGalleryData => {
  const thumbnailById = new Map<string, NonNullable<MediaFileRecord['thumbnail']>>();
  for (const item of latestItems) {
    if (item.thumbnail) {
      thumbnailById.set(item.fileNodeId, item.thumbnail);
    }
  }

  if (thumbnailById.size === 0) {
    return data;
  }

  let changed = false;
  const pages = data.pages.map((page) => {
    let pageChanged = false;
    const items = page.items.map((item) => {
      const thumbnail = item.thumbnail ? undefined : thumbnailById.get(item.fileNodeId);
      if (!thumbnail) {
        return item;
      }

      pageChanged = true;
      return { ...item, thumbnail };
    });

    if (!pageChanged) {
      return page;
    }

    changed = true;
    return { ...page, items };
  });

  return changed ? { ...data, pages } : data;
};

interface MediaThumbnailFollowUpOptions {
  queryClient: QueryClient;
  /** The gallery's infinite query. */
  queryKey: QueryKey;
  /** Requests the newest media (the gallery's first page), where new uploads are listed. */
  fetchLatest: () => Promise<MediaListResponse>;
  delaysMs?: readonly number[];
}

export interface MediaThumbnailFollowUp {
  /**
   * Starts (or restarts, adding to the paths already followed) the follow-up for these uploaded paths. Call it once
   * the gallery has been refreshed after the batch, so the new items are loaded.
   */
  start: (uploadedPaths: Iterable<string>) => void;
  /** Stops for good: no further request or cache write. */
  dispose: () => void;
}

/**
 * Fetches the gallery's newest items again, a bounded number of times, while recently uploaded items are loaded
 * without a thumbnail, and copies the thumbnails that arrived onto the loaded items. It never refetches the paged
 * gallery query itself (every loaded page) and leaves its fetching state alone, so the gallery's paging (one
 * request at a time, its status text) is unaffected; it skips a round while that query is fetching, since the
 * result of that fetch replaces the cache anyway and may carry the thumbnails itself.
 */
export const createMediaThumbnailFollowUp = ({
  queryClient,
  queryKey,
  fetchLatest,
  delaysMs = MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS
}: MediaThumbnailFollowUpOptions): MediaThumbnailFollowUp => {
  let followedPaths = new Set<string>();
  let step = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Bumped by start and dispose, so a request that was in flight does not schedule a second chain of rounds.
  let run = 0;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const galleryIsFetching = () => queryClient.isFetching({ queryKey, exact: true }) > 0;

  const scheduleNextRound = () => {
    followedPaths = pathsAwaitingThumbnail(queryClient.getQueryData<MediaGalleryData>(queryKey), followedPaths);
    const delay = delaysMs[step];
    if (followedPaths.size === 0 || delay === undefined) {
      followedPaths = new Set();
      return;
    }

    step += 1;
    const roundRun = run;
    timer = setTimeout(() => {
      timer = null;
      void runRound(roundRun);
    }, delay);
  };

  const runRound = async (roundRun: number) => {
    // The gallery may have changed since this round was scheduled (a refetch brought the thumbnails, an item was
    // trashed): send nothing when no followed item is still waiting.
    followedPaths = pathsAwaitingThumbnail(queryClient.getQueryData<MediaGalleryData>(queryKey), followedPaths);
    if (followedPaths.size === 0) {
      return;
    }

    if (galleryIsFetching()) {
      scheduleNextRound();
      return;
    }

    let latest: MediaListResponse | null = null;
    try {
      latest = await fetchLatest();
    } catch {
      // A failed round counts toward the bound; the next one tries again.
    }

    if (disposed) {
      return;
    }

    if (latest && !galleryIsFetching()) {
      const data = queryClient.getQueryData<MediaGalleryData>(queryKey);
      const next = data ? withNewThumbnails(data, latest.items) : data;
      if (next && next !== data) {
        queryClient.setQueryData<MediaGalleryData>(queryKey, next);
      }
    }

    if (roundRun === run) {
      scheduleNextRound();
    }
  };

  return {
    start: (uploadedPaths) => {
      if (disposed) {
        return;
      }

      for (const path of uploadedPaths) {
        followedPaths.add(path);
      }

      run += 1;
      step = 0;
      clearTimer();
      scheduleNextRound();
    },
    dispose: () => {
      disposed = true;
      run += 1;
      clearTimer();
      followedPaths = new Set();
    }
  };
};
