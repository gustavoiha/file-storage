import { describe, expect, it } from 'vitest';
import { formatSkippedNonMediaFilesMessage } from '@/pages/dockspaceMedia/mediaHelpers';

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
