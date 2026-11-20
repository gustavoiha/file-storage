import { describe, expect, it } from 'vitest';
import { positionMenuAtPoint } from '@/lib/menuPosition';

const viewport = { width: 390, height: 844 };
const menu = { width: 180, height: 120 };

describe('positionMenuAtPoint', () => {
  it('opens below-right of the anchor when it fits', () => {
    expect(positionMenuAtPoint({ x: 100, y: 200 }, menu, viewport)).toEqual({ x: 104, y: 204 });
  });

  it('shifts left to keep an 8 px margin from the right edge', () => {
    expect(positionMenuAtPoint({ x: 300, y: 200 }, menu, viewport)).toEqual({ x: 390 - 8 - 180, y: 204 });
  });

  it('flips above the anchor when it would overflow the bottom', () => {
    expect(positionMenuAtPoint({ x: 100, y: 800 }, menu, viewport)).toEqual({ x: 104, y: 800 - 4 - 120 });
  });

  it('never goes past the top or left margin', () => {
    expect(positionMenuAtPoint({ x: -50, y: 60 }, { width: 180, height: 700 }, { width: 390, height: 600 })).toEqual({
      x: 8,
      y: 8
    });
  });
});
