/**
 * When to ask for the next page of the media gallery.
 *
 * The gallery keeps a lookahead of loaded content below the viewport: at least
 * MEDIA_LOAD_AHEAD_MIN_VIEWPORTS viewport heights, plus the distance the user covers at their current scroll speed
 * during MEDIA_LOAD_AHEAD_LEAD_TIME_MS (roughly how long a page takes to arrive), capped at
 * MEDIA_LOAD_AHEAD_MAX_VIEWPORTS viewport heights.
 */
export const MEDIA_LOAD_AHEAD_MIN_VIEWPORTS = 2;
export const MEDIA_LOAD_AHEAD_MAX_VIEWPORTS = 6;
export const MEDIA_LOAD_AHEAD_LEAD_TIME_MS = 1500;
/** A scroll speed older than this (no scroll event since) counts as stopped. */
export const MEDIA_SCROLL_SPEED_IDLE_MS = 200;
/** Weight of the newest scroll event in the smoothed speed. */
const SCROLL_SPEED_SMOOTHING = 0.5;

export interface ScrollSpeedSample {
  scrollTop: number;
  time: number;
  /** Smoothed downward speed in px per ms (0 when scrolling up). */
  speedPxPerMs: number;
}

const toFiniteNonNegative = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

/** Distance (px) of loaded content to keep below the viewport. */
export const getLoadAheadPx = ({
  viewportHeightPx,
  scrollSpeedPxPerMs
}: {
  viewportHeightPx: number;
  scrollSpeedPxPerMs: number;
}): number => {
  const viewport = toFiniteNonNegative(viewportHeightPx);
  const speed = toFiniteNonNegative(scrollSpeedPxPerMs);
  const minimum = viewport * MEDIA_LOAD_AHEAD_MIN_VIEWPORTS;
  const maximum = viewport * MEDIA_LOAD_AHEAD_MAX_VIEWPORTS;
  return Math.min(maximum, minimum + speed * MEDIA_LOAD_AHEAD_LEAD_TIME_MS);
};

export const shouldLoadNextPage = ({
  remainingPx,
  loadAheadPx,
  hasNextPage,
  isFetching,
  hasNextPageError
}: {
  remainingPx: number;
  loadAheadPx: number;
  hasNextPage: boolean;
  /**
   * Any request of the media query in flight: a next page, or a background refetch of the loaded pages (window
   * focus, an invalidation after an upload). A next-page request made during a refetch only joins the refetch.
   */
  isFetching: boolean;
  hasNextPageError: boolean;
}): boolean => hasNextPage && !isFetching && !hasNextPageError && remainingPx < loadAheadPx;

/** Folds a scroll event into the smoothed downward scroll speed. */
export const nextScrollSpeedSample = (
  previous: ScrollSpeedSample | null,
  scrollTop: number,
  time: number
): ScrollSpeedSample => {
  if (!previous) {
    return { scrollTop, time, speedPxPerMs: 0 };
  }

  const elapsed = time - previous.time;
  if (elapsed <= 0) {
    return { ...previous, scrollTop };
  }

  const instant = toFiniteNonNegative((scrollTop - previous.scrollTop) / elapsed);
  const carried = elapsed > MEDIA_SCROLL_SPEED_IDLE_MS ? 0 : previous.speedPxPerMs;
  return {
    scrollTop,
    time,
    speedPxPerMs: carried + (instant - carried) * SCROLL_SPEED_SMOOTHING
  };
};

/** The scroll speed at `now`: 0 once scrolling has stopped. */
export const currentScrollSpeed = (sample: ScrollSpeedSample | null, now: number): number =>
  sample && now - sample.time <= MEDIA_SCROLL_SPEED_IDLE_MS ? sample.speedPxPerMs : 0;
