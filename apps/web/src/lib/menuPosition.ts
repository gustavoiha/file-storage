export interface MenuPoint {
  x: number;
  y: number;
}

export interface MenuSize {
  width: number;
  height: number;
}

/** Gap between the anchor point (pointer or finger) and the menu's corner. */
export const MENU_ANCHOR_OFFSET_PX = 4;
/** Minimum distance kept between the menu and the viewport edges. */
export const MENU_VIEWPORT_MARGIN_PX = 8;

/**
 * Places a menu of `size` next to `anchor` so it stays inside `viewport`:
 * it opens below-right of the anchor, shifts left when it would overflow the right edge,
 * flips above the anchor when it would overflow the bottom, and keeps an 8 px margin.
 */
export const positionMenuAtPoint = (
  anchor: MenuPoint,
  size: MenuSize,
  viewport: MenuSize,
  margin = MENU_VIEWPORT_MARGIN_PX,
  offset = MENU_ANCHOR_OFFSET_PX
): MenuPoint => {
  const maxX = viewport.width - margin - size.width;
  const maxY = viewport.height - margin - size.height;

  let x = anchor.x + offset;
  if (x > maxX) {
    x = maxX;
  }

  let y = anchor.y + offset;
  if (y > maxY) {
    y = anchor.y - offset - size.height;
  }

  if (y > maxY) {
    y = maxY;
  }

  return {
    x: Math.max(margin, x),
    y: Math.max(margin, y)
  };
};
