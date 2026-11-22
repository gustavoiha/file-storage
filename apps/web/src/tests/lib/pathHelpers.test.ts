import { describe, expect, it } from 'vitest';
import { invalidUploadPathsMessage, leafFolderPathsForUploads } from '@/components/files/pathHelpers';

describe('leafFolderPathsForUploads', () => {
  it('returns only the deepest folders, shallowest first', () => {
    expect(
      leafFolderPathsForUploads(
        [
          '/a/v/test/root.pdf',
          '/a/v/test/test-a/a1.pdf',
          '/a/v/test/test-a/a2.pdf',
          '/a/v/test/test-b/test-c/c1.pdf',
          '/a/v/other.pdf'
        ],
        '/a/v'
      )
    ).toEqual(['/a/v/test/test-a', '/a/v/test/test-b/test-c']);
  });

  it('excludes the current folder and the root', () => {
    expect(leafFolderPathsForUploads(['/x.pdf', '/y.pdf'], '/')).toEqual([]);
    expect(leafFolderPathsForUploads(['/docs/x.pdf'], '/docs/')).toEqual([]);
    expect(leafFolderPathsForUploads(['/docs/x.pdf'], '/')).toEqual(['/docs']);
  });

  it('does not treat a sibling with a longer name as a descendant', () => {
    expect(leafFolderPathsForUploads(['/docs/a.pdf', '/docs-archive/b.pdf'], '/')).toEqual([
      '/docs',
      '/docs-archive'
    ]);
  });
});

describe('invalidUploadPathsMessage', () => {
  it('uses the singular for one skipped file', () => {
    expect(invalidUploadPathsMessage(1)).toBe('1 file had an invalid upload path and was skipped.');
  });

  it('uses the plural for several skipped files', () => {
    expect(invalidUploadPathsMessage(2)).toBe('2 files had invalid upload paths and were skipped.');
    expect(invalidUploadPathsMessage(12)).toBe('12 files had invalid upload paths and were skipped.');
  });
});
