import { pluralize } from '@/lib/fileFormat';

const bytesFormatter = new Intl.NumberFormat('en-US');
const timestampFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC'
});

export const basename = (fullPath: string): string => {
  const segments = fullPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? fullPath;
};

export const formatBytes = (value: number): string =>
  `${bytesFormatter.format(value)} ${value === 1 ? 'byte' : 'bytes'}`;

export const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return timestampFormatter.format(date);
};

export const formatSkippedNonMediaFilesMessage = (count: number): string =>
  count === 1
    ? '1 file was skipped because this gallery accepts only photos and videos.'
    : `${count} files were skipped because this gallery accepts only photos and videos.`;

/** Result of a batch move to trash, e.g. "Moved 1 item to trash." or "Moved 2 items to trash. 1 failed." */
export const formatTrashResultMessage = (movedCount: number, failedCount: number): string =>
  failedCount > 0
    ? `Moved ${pluralize(movedCount, 'item')} to trash. ${failedCount} failed.`
    : `Moved ${pluralize(movedCount, 'item')} to trash.`;

export const formatDuplicatesSelectedForTrashMessage = (count: number): string =>
  `${pluralize(count, 'item')} selected for trash.`;

/** Move to trash dialog description, for the gallery selection or the Find duplicates selection. */
export const formatTrashDialogDescription = (count: number, context: 'bulk' | 'duplicates'): string =>
  `This will move ${pluralize(
    count,
    context === 'duplicates' ? 'selected duplicate media file' : 'selected media file'
  )} to trash.`;

/** Find duplicates summary lines, e.g. "1 duplicate group found." and "3 repeated files." */
export const formatDuplicateGroupsFound = (count: number): string =>
  `${pluralize(count, 'duplicate group')} found.`;

export const formatRepeatedFiles = (count: number): string => `${pluralize(count, 'repeated file')}.`;

/** One duplicate group's line, e.g. "2 files, 100 bytes reclaimable". */
export const formatDuplicateGroupDetails = (fileCount: number, reclaimableBytes: number): string =>
  `${pluralize(fileCount, 'file')}, ${formatBytes(reclaimableBytes)} reclaimable`;
