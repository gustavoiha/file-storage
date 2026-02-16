import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteObjectsCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn()
}));

vi.mock('../lib/clients.js', () => ({
  s3Client: {
    send: sendMock
  }
}));

beforeEach(() => {
  process.env.BUCKET_NAME = 'bucket';
  process.env.TABLE_NAME = 'table';
  sendMock.mockReset();
  vi.resetModules();
});

describe('s3 versioning helpers', () => {
  it('returns false when no object versions exist', async () => {
    sendMock.mockResolvedValueOnce({
      Versions: [],
      DeleteMarkers: [],
      IsTruncated: false
    });

    const { objectHasAnyVersion } = await import('../lib/s3.js');
    const result = await objectHasAnyVersion('dock-1/file-1');

    expect(result).toBe(false);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[0]).toBeInstanceOf(ListObjectVersionsCommand);
  });

  it('purges all versions and delete markers for a key', async () => {
    sendMock
      .mockResolvedValueOnce({
        Versions: [
          { Key: 'dock-1/file-1', VersionId: 'v1' },
          { Key: 'dock-1/file-1-other', VersionId: 'ignore-me' }
        ],
        DeleteMarkers: [{ Key: 'dock-1/file-1', VersionId: 'd1' }],
        NextKeyMarker: 'dock-1/file-1',
        NextVersionIdMarker: 'd1',
        IsTruncated: true
      })
      .mockResolvedValueOnce({
        Versions: [{ Key: 'dock-1/file-1', VersionId: 'v2' }],
        DeleteMarkers: [],
        IsTruncated: false
      })
      .mockResolvedValueOnce({
        Deleted: [
          { Key: 'dock-1/file-1', VersionId: 'v1' },
          { Key: 'dock-1/file-1', VersionId: 'd1' },
          { Key: 'dock-1/file-1', VersionId: 'v2' }
        ]
      })
      .mockResolvedValueOnce({
        Versions: [],
        DeleteMarkers: [],
        IsTruncated: false
      });

    const { purgeObjectVersions } = await import('../lib/s3.js');
    const result = await purgeObjectVersions('dock-1/file-1');

    expect(result).toEqual({
      discoveredVersionCount: 3,
      deletedVersionCount: 3,
      remainingVersionCount: 0
    });
    expect(sendMock).toHaveBeenCalledTimes(4);
    expect(sendMock.mock.calls[0]?.[0]).toBeInstanceOf(ListObjectVersionsCommand);
    expect(sendMock.mock.calls[1]?.[0]).toBeInstanceOf(ListObjectVersionsCommand);
    expect(sendMock.mock.calls[2]?.[0]).toBeInstanceOf(DeleteObjectsCommand);
    expect(sendMock.mock.calls[3]?.[0]).toBeInstanceOf(ListObjectVersionsCommand);

    const deleteCommand = sendMock.mock.calls[2]?.[0] as DeleteObjectsCommand;
    expect(deleteCommand.input.Delete?.Objects).toEqual([
      { Key: 'dock-1/file-1', VersionId: 'v1' },
      { Key: 'dock-1/file-1', VersionId: 'd1' },
      { Key: 'dock-1/file-1', VersionId: 'v2' }
    ]);
  });
});
