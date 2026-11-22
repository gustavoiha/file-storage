import { describe, expect, it } from 'vitest';
import {
  MEDIA_LOAD_AHEAD_LEAD_TIME_MS,
  MEDIA_LOAD_AHEAD_MAX_VIEWPORTS,
  MEDIA_LOAD_AHEAD_MIN_VIEWPORTS,
  MEDIA_SCROLL_SPEED_IDLE_MS,
  currentScrollSpeed,
  getLoadAheadPx,
  nextScrollSpeedSample,
  shouldLoadNextPage
} from '@/pages/dockspaceMedia/mediaGridLoadAhead';

describe('getLoadAheadPx', () => {
  const viewportHeightPx = 900;

  it('keeps at least two viewport heights loaded when scrolling has stopped', () => {
    expect(MEDIA_LOAD_AHEAD_MIN_VIEWPORTS).toBeGreaterThanOrEqual(2);
    expect(getLoadAheadPx({ viewportHeightPx, scrollSpeedPxPerMs: 0 })).toBe(viewportHeightPx * 2);
  });

  it('adds the distance covered at the current speed while a page loads when scrolling slowly', () => {
    const slow = 0.4; // px per ms
    const lookahead = getLoadAheadPx({ viewportHeightPx, scrollSpeedPxPerMs: slow });
    expect(lookahead).toBe(viewportHeightPx * 2 + slow * MEDIA_LOAD_AHEAD_LEAD_TIME_MS);
    expect(lookahead).toBeGreaterThan(viewportHeightPx * 2);
    expect(lookahead).toBeLessThan(viewportHeightPx * MEDIA_LOAD_AHEAD_MAX_VIEWPORTS);
  });

  it('grows with speed up to a bounded maximum of six viewport heights when scrolling fast', () => {
    const medium = getLoadAheadPx({ viewportHeightPx, scrollSpeedPxPerMs: 1.5 });
    const fast = getLoadAheadPx({ viewportHeightPx, scrollSpeedPxPerMs: 8 });
    const absurd = getLoadAheadPx({ viewportHeightPx, scrollSpeedPxPerMs: 1_000 });
    expect(fast).toBeGreaterThan(medium);
    expect(fast).toBe(viewportHeightPx * 6);
    expect(absurd).toBe(viewportHeightPx * MEDIA_LOAD_AHEAD_MAX_VIEWPORTS);
  });

  it('ignores negative or invalid input', () => {
    expect(getLoadAheadPx({ viewportHeightPx, scrollSpeedPxPerMs: -5 })).toBe(viewportHeightPx * 2);
    expect(getLoadAheadPx({ viewportHeightPx, scrollSpeedPxPerMs: Number.NaN })).toBe(viewportHeightPx * 2);
    expect(getLoadAheadPx({ viewportHeightPx: -1, scrollSpeedPxPerMs: 2 })).toBe(0);
  });
});

describe('shouldLoadNextPage', () => {
  const base = {
    remainingPx: 500,
    loadAheadPx: 1800,
    hasNextPage: true,
    isFetchingNextPage: false,
    hasNextPageError: false
  };

  it('requests when less than the lookahead is left below the viewport', () => {
    expect(shouldLoadNextPage(base)).toBe(true);
    expect(shouldLoadNextPage({ ...base, remainingPx: 1799 })).toBe(true);
    expect(shouldLoadNextPage({ ...base, remainingPx: 1800 })).toBe(false);
  });

  it('never requests without a next page, while one is loading, or after one failed', () => {
    expect(shouldLoadNextPage({ ...base, hasNextPage: false })).toBe(false);
    expect(shouldLoadNextPage({ ...base, isFetchingNextPage: true })).toBe(false);
    expect(shouldLoadNextPage({ ...base, hasNextPageError: true })).toBe(false);
  });
});

describe('scroll speed', () => {
  it('starts at zero and measures downward speed', () => {
    const first = nextScrollSpeedSample(null, 0, 1_000);
    expect(first.speedPxPerMs).toBe(0);
    const second = nextScrollSpeedSample(first, 100, 1_050); // 2 px/ms
    expect(second.speedPxPerMs).toBeGreaterThan(0);
    const third = nextScrollSpeedSample(second, 200, 1_100);
    expect(third.speedPxPerMs).toBeGreaterThan(second.speedPxPerMs);
    expect(third.speedPxPerMs).toBeLessThanOrEqual(2);
  });

  it('treats scrolling up as no downward speed', () => {
    const first = nextScrollSpeedSample(null, 1_000, 0);
    const up = nextScrollSpeedSample(first, 500, 50);
    expect(up.speedPxPerMs).toBe(0);
  });

  it('reports zero once scrolling has stopped', () => {
    let sample = nextScrollSpeedSample(null, 0, 0);
    sample = nextScrollSpeedSample(sample, 150, 50);
    sample = nextScrollSpeedSample(sample, 300, 100);
    expect(currentScrollSpeed(sample, 100)).toBeGreaterThan(0);
    expect(currentScrollSpeed(sample, 100 + MEDIA_SCROLL_SPEED_IDLE_MS + 1)).toBe(0);
    expect(currentScrollSpeed(null, 0)).toBe(0);
  });

  it('does not carry an old speed into a new scroll after a pause', () => {
    let sample = nextScrollSpeedSample(null, 0, 0);
    sample = nextScrollSpeedSample(sample, 400, 50); // fast
    const resumed = nextScrollSpeedSample(sample, 410, 50 + MEDIA_SCROLL_SPEED_IDLE_MS + 100);
    expect(resumed.speedPxPerMs).toBeLessThan(0.05);
  });
});
