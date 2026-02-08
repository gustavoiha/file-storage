import { describe, expect, it } from 'vitest';
import { normalizeFullPath, toFolderPrefix, toRelativePath } from '../domain/path.js';

describe('path normalization', () => {
  it('normalizes and prepends slash', () => {
    expect(normalizeFullPath('docs/a.txt')).toBe('/docs/a.txt');
  });

  it('collapses duplicate slashes', () => {
    expect(normalizeFullPath('/docs//x.txt')).toBe('/docs/x.txt');
  });

  it('rejects traversal', () => {
    expect(() => normalizeFullPath('/docs/../x.txt')).toThrow();
  });

  it('builds folder prefix', () => {
    expect(toFolderPrefix('/docs')).toBe('/docs/');
  });

  it('builds relative path', () => {
    expect(toRelativePath('/docs/x.txt')).toBe('docs/x.txt');
  });
});
