import { Grid2x2, Grid3x3, LayoutGrid, type LucideIcon } from 'lucide-react';
import type { MediaGridSize } from '@/pages/dockspaceMedia/mediaTypes';

/** Tiles touch: no gap between rows or columns. */
export const MEDIA_GRID_GAP_PX = 0;
export const MEDIA_GRID_OVERSCAN_ROWS = 2;

/** Tiles are square: the grid fits as many columns of at least minColumnWidthPx as it can, and rows are as tall as a column is wide. */
export const MEDIA_GRID_LAYOUT: Record<MediaGridSize, { minColumnWidthPx: number }> = {
  small: {
    minColumnWidthPx: 132
  },
  medium: {
    minColumnWidthPx: 190
  },
  large: {
    minColumnWidthPx: 248
  }
};

/**
 * Columns and square row size for a grid `widthPx` wide. With no width yet (first render, before the scroll box is
 * measured), the row size falls back to the minimum column width so the row math never divides by zero.
 */
export const getMediaGridMetrics = (
  widthPx: number,
  minColumnWidthPx: number,
  gapPx: number = MEDIA_GRID_GAP_PX
): { columnCount: number; rowHeightPx: number; rowStridePx: number } => {
  const columnCount = Math.max(1, Math.floor((widthPx + gapPx) / (minColumnWidthPx + gapPx)));
  const columnWidthPx = widthPx > 0 ? (widthPx - gapPx * (columnCount - 1)) / columnCount : minColumnWidthPx;
  const rowHeightPx = Math.max(1, columnWidthPx);

  return { columnCount, rowHeightPx, rowStridePx: rowHeightPx + gapPx };
};

export const MEDIA_GRID_SIZE_OPTIONS: Array<{
  size: MediaGridSize;
  label: string;
  Icon: LucideIcon;
}> = [
  { size: 'small', label: 'Show small thumbnails', Icon: Grid3x3 },
  { size: 'medium', label: 'Show medium thumbnails', Icon: Grid2x2 },
  { size: 'large', label: 'Show large thumbnails', Icon: LayoutGrid }
];
