import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  formatDuplicateGroupDetails,
  formatDuplicateGroupsFound,
  formatDuplicatesSelectedForTrashMessage,
  formatRepeatedFiles,
  formatSkippedNonMediaFilesMessage,
  formatTrashDialogDescription,
  formatTrashResultMessage,
  trashResultActionMessage
} from '@/pages/dockspaceMedia/mediaHelpers';

describe('formatSkippedNonMediaFilesMessage', () => {
  it('uses the singular for one skipped file', () => {
    expect(formatSkippedNonMediaFilesMessage(1)).toBe(
      '1 file was skipped because this gallery accepts only photos and videos.'
    );
  });

  it('uses the plural for several skipped files', () => {
    expect(formatSkippedNonMediaFilesMessage(3)).toBe(
      '3 files were skipped because this gallery accepts only photos and videos.'
    );
  });

  it('never names an internal dockspace type', () => {
    for (const count of [1, 2]) {
      expect(formatSkippedNonMediaFilesMessage(count)).not.toMatch(/PHOTOS_VIDEOS|image\/video/);
    }
  });
});

describe('formatTrashResultMessage', () => {
  it('uses the singular for one moved item', () => {
    expect(formatTrashResultMessage(1, 0)).toBe('Moved 1 item to trash.');
    expect(formatTrashResultMessage(1, 2)).toBe('Moved 1 item to trash. 2 failed.');
  });

  it('uses the plural for zero or several moved items', () => {
    expect(formatTrashResultMessage(3, 0)).toBe('Moved 3 items to trash.');
    expect(formatTrashResultMessage(2, 1)).toBe('Moved 2 items to trash. 1 failed.');
    expect(formatTrashResultMessage(0, 4)).toBe('Moved 0 items to trash. 4 failed.');
  });
});

describe('trashResultActionMessage', () => {
  it('shows a result where every file moved in the info tone', () => {
    expect(trashResultActionMessage(1, 0)).toEqual({ message: 'Moved 1 item to trash.', tone: 'info' });
    expect(trashResultActionMessage(3, 0)).toEqual({ message: 'Moved 3 items to trash.', tone: 'info' });
  });

  it('shows a partial failure in the error tone (T-0048)', () => {
    expect(trashResultActionMessage(1, 1)).toEqual({ message: 'Moved 1 item to trash. 1 failed.', tone: 'error' });
  });

  it('shows a full failure in the error tone (T-0048)', () => {
    expect(trashResultActionMessage(0, 4)).toEqual({ message: 'Moved 0 items to trash. 4 failed.', tone: 'error' });
  });
});

describe('formatDuplicatesSelectedForTrashMessage', () => {
  it('uses the singular for one item and the plural otherwise', () => {
    expect(formatDuplicatesSelectedForTrashMessage(1)).toBe('1 item selected for trash.');
    expect(formatDuplicatesSelectedForTrashMessage(0)).toBe('0 items selected for trash.');
    expect(formatDuplicatesSelectedForTrashMessage(4)).toBe('4 items selected for trash.');
  });
});

describe('formatTrashDialogDescription', () => {
  it('names one gallery file in the singular and several in the plural', () => {
    expect(formatTrashDialogDescription(1, 'bulk')).toBe('This will move 1 selected media file to trash.');
    expect(formatTrashDialogDescription(2, 'bulk')).toBe('This will move 2 selected media files to trash.');
  });

  it('names one duplicate file in the singular and several in the plural', () => {
    expect(formatTrashDialogDescription(1, 'duplicates')).toBe(
      'This will move 1 selected duplicate media file to trash.'
    );
    expect(formatTrashDialogDescription(3, 'duplicates')).toBe(
      'This will move 3 selected duplicate media files to trash.'
    );
  });
});

describe('Find duplicates summary', () => {
  it('names one duplicate group in the singular and zero or several in the plural', () => {
    expect(formatDuplicateGroupsFound(1)).toBe('1 duplicate group found.');
    expect(formatDuplicateGroupsFound(0)).toBe('0 duplicate groups found.');
    expect(formatDuplicateGroupsFound(3)).toBe('3 duplicate groups found.');
  });

  it('names one repeated file in the singular and zero or several in the plural', () => {
    expect(formatRepeatedFiles(1)).toBe('1 repeated file.');
    expect(formatRepeatedFiles(0)).toBe('0 repeated files.');
    expect(formatRepeatedFiles(4)).toBe('4 repeated files.');
  });

  it('names one file and one byte in the singular in a group line', () => {
    expect(formatDuplicateGroupDetails(1, 1)).toBe('1 file, 1 byte reclaimable');
    expect(formatDuplicateGroupDetails(2, 100)).toBe('2 files, 100 bytes reclaimable');
  });
});

describe('formatBytes', () => {
  it('uses the singular for one byte and the plural otherwise, with thousands separators', () => {
    expect(formatBytes(1)).toBe('1 byte');
    expect(formatBytes(0)).toBe('0 bytes');
    expect(formatBytes(1234)).toBe('1,234 bytes');
  });
});
