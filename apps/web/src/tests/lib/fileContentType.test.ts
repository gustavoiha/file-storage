import { describe, expect, it } from 'vitest';
import { inferUploadContentType, isLikelyMediaFile } from '@/lib/fileContentType';

const mockFile = (name: string, type: string): File => ({ name, type } as File);

describe('fileContentType', () => {
  it('returns declared content type when available', () => {
    const file = mockFile('photo.heic', 'image/heic');
    expect(inferUploadContentType(file)).toBe('image/heic');
  });

  it('infers HEIC content type from extension when type is empty', () => {
    const file = mockFile('IMG_0012.HEIC', '');
    expect(inferUploadContentType(file)).toBe('image/heic');
    expect(isLikelyMediaFile(file)).toBe(true);
  });

  it('returns octet-stream for unknown extension', () => {
    const file = mockFile('document.custom', '');
    expect(inferUploadContentType(file)).toBe('application/octet-stream');
    expect(isLikelyMediaFile(file)).toBe(false);
  });
});
