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

/** The most items `GET /media` returns per request. */
export const MEDIA_LIST_MAX_PAGE_SIZE = 200;

/**
 * The paths among `paths` still to follow: every path except those whose item is loaded in the gallery with a
 * thumbnail, and, once the gallery has loaded its last page, those it does not list at all (trashed, or not media).
 * Otherwise a path with no loaded item is kept, since it may be on a page the user has not scrolled to yet; the
 * follow-up's own requests decide whether it has a thumbnail or is gone.
 */
export const pathsStillFollowed = (
  data: MediaGalleryData | undefined,
  paths: ReadonlySet<string>
): Set<string> => {
  const followed = new Set(paths);
  if (!data || followed.size === 0) {
    return followed;
  }

  const loadedPaths = new Set<string>();
  for (const page of data.pages) {
    for (const item of page.items) {
      loadedPaths.add(item.fullPath);
      if (item.thumbnail) {
        followed.delete(item.fullPath);
      }
    }
  }

  const everyPageLoaded = data.pages.length > 0 && !data.pages[data.pages.length - 1]?.nextCursor;
  if (everyPageLoaded) {
    for (const path of followed) {
      if (!loadedPaths.has(path)) {
        followed.delete(path);
      }
    }
  }

  return followed;
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
  /** Requests one page of the gallery's listing (newest first), as the gallery query does. */
  fetchPage: (options: { cursor?: string; limit: number }) => Promise<MediaListResponse>;
  /** The smallest page to request: the gallery's own page size, so a small batch costs one request per round. */
  minPageSize?: number;
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
 * Follows recently uploaded items until each has a thumbnail. Every round requests the newest items again (pages
 * sized to the batch, between `minPageSize` and the API's 200, walking on only while a followed item is still
 * unseen, and at most one page more than the batch needs), copies the thumbnails that arrived onto the loaded items,
 * and drops a path once its item has a thumbnail, is not listed where the newest items are, or the rounds run out.
 * A path whose item is not loaded (beyond the loaded pages) stays followed, so a tile the user scrolls to later
 * still gets its thumbnail.
 *
 * It never refetches the paged gallery query itself (every loaded page) and leaves its fetching state alone, so the
 * gallery's paging (one request at a time, its status text) is unaffected; it skips a round while that query is
 * fetching, and does not write a result that lands while it fetches, since that fetch replaces the cache anyway.
 */
export const createMediaThumbnailFollowUp = ({
  queryClient,
  queryKey,
  fetchPage,
  minPageSize = 120,
  delaysMs = MEDIA_THUMBNAIL_FOLLOW_UP_DELAYS_MS
}: MediaThumbnailFollowUpOptions): MediaThumbnailFollowUp => {
  let followedPaths = new Set<string>();
  // The last `updatedAt` seen for a followed path, loaded or fetched. The listing is ordered by it (newest first), so
  // a round that walked past it without finding the path shows the item is gone (trashed, moved or renamed).
  const lastUpdatedAt = new Map<string, string>();
  // Items per request, set from the followed count at start: the uploads are the newest items, so one request of
  // this size usually covers them all. It does not shrink as paths drop, since the ones left can be anywhere in it.
  let pageLimit = minPageSize;
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

  const stopFollowing = (path: string) => {
    followedPaths.delete(path);
    lastUpdatedAt.delete(path);
  };

  const galleryIsFetching = () => queryClient.isFetching({ queryKey, exact: true }) > 0;

  /** Drops the paths loaded with a thumbnail and notes when the others were last updated. */
  const pruneWithLoadedGallery = () => {
    const data = queryClient.getQueryData<MediaGalleryData>(queryKey);
    const stillFollowed = pathsStillFollowed(data, followedPaths);
    for (const path of followedPaths) {
      if (!stillFollowed.has(path)) {
        stopFollowing(path);
      }
    }

    for (const page of data?.pages ?? []) {
      for (const item of page.items) {
        if (followedPaths.has(item.fullPath)) {
          lastUpdatedAt.set(item.fullPath, item.updatedAt);
        }
      }
    }
  };

  const scheduleNextRound = () => {
    pruneWithLoadedGallery();
    const delay = delaysMs[step];
    if (followedPaths.size === 0 || delay === undefined) {
      followedPaths = new Set();
      lastUpdatedAt.clear();
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
    // The gallery may have changed since this round was scheduled (a refetch or a scroll brought the thumbnails):
    // send nothing when no followed item is still waiting.
    pruneWithLoadedGallery();
    if (followedPaths.size === 0) {
      return;
    }

    if (galleryIsFetching()) {
      scheduleNextRound();
      return;
    }

    const limit = pageLimit;
    // Enough pages for every followed item, plus one for items listed above them since (other uploads, edits).
    const maxPages = Math.ceil(followedPaths.size / limit) + 1;
    const fetchedItems: MediaFileRecord[] = [];
    const seen = new Map<string, MediaFileRecord>();
    // Whether the walk covered every page the followed items can be on: the listing's end, or `maxPages` pages.
    let walkComplete = false;
    let oldestFetchedUpdatedAt: string | undefined;
    const isPassed = (path: string) => {
      const updatedAt = lastUpdatedAt.get(path);
      return updatedAt !== undefined && oldestFetchedUpdatedAt !== undefined && oldestFetchedUpdatedAt < updatedAt;
    };

    let cursor: string | undefined;
    for (let pageCount = 1; ; pageCount += 1) {
      let page: MediaListResponse;
      try {
        page = await fetchPage({ ...(cursor ? { cursor } : {}), limit });
      } catch {
        // A failed round counts toward the bound; the next one tries again. Pages already fetched still count.
        break;
      }

      if (disposed) {
        return;
      }

      for (const item of page.items) {
        fetchedItems.push(item);
        if (followedPaths.has(item.fullPath)) {
          seen.set(item.fullPath, item);
        }
      }

      oldestFetchedUpdatedAt = page.items[page.items.length - 1]?.updatedAt ?? oldestFetchedUpdatedAt;
      if (!page.nextCursor || pageCount >= maxPages) {
        walkComplete = true;
        break;
      }

      const everyPathAccountedFor = [...followedPaths].every((path) => seen.has(path) || isPassed(path));
      if (everyPathAccountedFor || roundRun !== run) {
        break;
      }

      cursor = page.nextCursor;
    }

    // A result that lands while the gallery query fetches is not written (that fetch replaces the cache), and its
    // thumbnails do not count as shown: the next round looks again.
    const canWrite = !galleryIsFetching();
    if (canWrite && fetchedItems.length > 0) {
      const data = queryClient.getQueryData<MediaGalleryData>(queryKey);
      const next = data ? withNewThumbnails(data, fetchedItems) : data;
      if (next && next !== data) {
        queryClient.setQueryData<MediaGalleryData>(queryKey, next);
      }
    }

    // After a restart meanwhile, a path added since may be missing only because this walk ran before it was listed.
    const restarted = roundRun !== run;
    for (const path of [...followedPaths]) {
      const item = seen.get(path);
      if (item) {
        if (item.thumbnail && canWrite) {
          stopFollowing(path);
        } else {
          lastUpdatedAt.set(path, item.updatedAt);
        }
      } else if (!restarted && (walkComplete || isPassed(path))) {
        // Not listed where the newest items are: it is gone (trashed, moved, renamed) or was never media.
        stopFollowing(path);
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

      pageLimit = Math.min(MEDIA_LIST_MAX_PAGE_SIZE, Math.max(minPageSize, followedPaths.size));
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
      lastUpdatedAt.clear();
    }
  };
};
