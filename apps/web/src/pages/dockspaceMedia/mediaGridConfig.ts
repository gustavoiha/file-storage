import { Grid2x2, Grid3x3, LayoutGrid, type LucideIcon } from 'lucide-react';
import type { MediaGridSize } from '@/pages/dockspaceMedia/mediaTypes';

export const MEDIA_GRID_GAP_PX = 12;
export const MEDIA_GRID_OVERSCAN_ROWS = 2;

export const MEDIA_GRID_LAYOUT: Record<
  MediaGridSize,
  { minColumnWidthPx: number; rowHeightPx: number }
> = {
  small: {
    minColumnWidthPx: 132,
    rowHeightPx: 140
  },
  medium: {
    minColumnWidthPx: 190,
    rowHeightPx: 198
  },
  large: {
    minColumnWidthPx: 248,
    rowHeightPx: 256
  }
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
