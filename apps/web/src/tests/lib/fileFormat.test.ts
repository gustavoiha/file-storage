import { describe, expect, it } from 'vitest';
import { describeFileType, formatFileSize, formatModifiedDate, pluralize } from '@/lib/fileFormat';

describe('fileFormat', () => {
  it('formats sizes', () => {
    expect(formatFileSize(undefined)).toBeNull();
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(3_100)).toBe('3 KB');
    expect(formatFileSize(219_000)).toBe('214 KB');
    expect(formatFileSize(3_040_870)).toBe('2.9 MB');
    expect(formatFileSize(15 * 1024 * 1024)).toBe('15 MB');
    expect(formatFileSize(2.5 * 1024 ** 3)).toBe('2.5 GB');
  });

  it('formats modified dates', () => {
    expect(formatModifiedDate('2025-09-15T12:00:00.000Z')).toBe('Sep 15, 2025');
    expect(formatModifiedDate('nope')).toBeNull();
    expect(formatModifiedDate(undefined)).toBeNull();
  });

  it('describes file types', () => {
    expect(describeFileType('image/jpeg', 'a.jpg')).toBe('JPEG image');
    expect(describeFileType(undefined, 'report.pdf')).toBe('PDF document');
    expect(describeFileType('application/x-custom', 'a.bin')).toBe('application/x-custom');
    expect(describeFileType('application/octet-stream', 'a.bin')).toBeNull();
  });

  it('pluralizes', () => {
    expect(pluralize(1, 'file')).toBe('1 file');
    expect(pluralize(2, 'folder')).toBe('2 folders');
  });
});
