import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMediaHashIndexSk } from '../domain/keys.js';
import type { DirectoryItem, FileNodeItem } from '../types/models.js';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn()
}));

vi.mock('../lib/clients.js', () => ({
  dynamoDoc: {
    send: sendMock
  }
}));

const baseFileNode = (): FileNodeItem => ({
  PK: 'U#user-1#S#dock-1',
  SK: 'L#file-1',
  type: 'FILE_NODE',
  parentFolderNodeId: 'root',
  s3Key: 'user-1/dockspaces/dock-1/files/file-1',
  name: 'photo.jpg',
  contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  size: 123,
  contentType: 'image/jpeg',
  etag: 'etag-1',
  createdAt: '2026-02-15T00:00:00.000Z',
  updatedAt: '2026-02-15T00:00:00.000Z'
});

const baseDirectory = (): DirectoryItem => ({
  PK: 'U#user-1#S#dock-1',
  SK: 'D#root#L#photo.jpg#file-1',
  type: 'DIRECTORY',
  name: 'photo.jpg',
  normalizedName: 'photo.jpg',
  childId: 'file-1',
  childType: 'file',
  parentFolderNodeId: 'root',
  createdAt: '2026-02-15T00:00:00.000Z',
  updatedAt: '2026-02-15T00:00:00.000Z'
});

const getTransactItems = (callIndex: number): unknown[] =>
  ((sendMock.mock.calls[callIndex]?.[0] as { input?: { TransactItems?: unknown[] } })?.input
    ?.TransactItems ?? []) as unknown[];

beforeEach(() => {
  process.env.TABLE_NAME = 'table';
  process.env.BUCKET_NAME = 'bucket';
  sendMock.mockReset();
  vi.resetModules();
});

describe('media hash index maintenance', () => {
  it('creates MEDIA_HASH_INDEX record when inserting new active media file', async () => {
    sendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({});

    const { upsertActiveFileByPath } = await import('../lib/repository.js');
    await upsertActiveFileByPath({
      userId: 'user-1',
      dockspaceId: 'dock-1',
      fullPath: '/photo.jpg',
      s3Key: 'user-1/dockspaces/dock-1/files/file-1',
      preferredFileNodeId: 'file-1',
      size: 123,
      contentType: 'image/jpeg',
      contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      etag: 'etag-1',
      nowIso: '2026-02-15T10:00:00.000Z'
    });

    const transactItems = getTransactItems(2);
    const mediaHashPut = transactItems.find((item) =>
      String((item as { Put?: { Item?: { type?: string } } }).Put?.Item?.type) === 'MEDIA_HASH_INDEX'
    ) as { Put: { Item: { SK: string; fileNodeId: string; contentHash: string } } } | undefined;

    expect(mediaHashPut).toBeDefined();
    expect(mediaHashPut?.Put.Item.SK).toBe(
      buildMediaHashIndexSk(
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'file-1'
      )
    );
    expect(mediaHashPut?.Put.Item.fileNodeId).toBe('file-1');
  });

  it('deletes MEDIA_HASH_INDEX record when trashing active media file', async () => {
    sendMock.mockResolvedValue({});

    const { markResolvedFileNodeTrashed } = await import('../lib/repository.js');
    await markResolvedFileNodeTrashed(
      'user-1',
      'dock-1',
      {
        fullPath: '/photo.jpg',
        folderPath: '/',
        fileNode: baseFileNode(),
        directory: baseDirectory()
      },
      '2026-02-15T10:00:00.000Z',
      '2026-03-17T10:00:00.000Z'
    );

    const transactItems = getTransactItems(0);
    const mediaHashDelete = transactItems.find((item) =>
      String((item as { Delete?: { Key?: { SK?: string } } }).Delete?.Key?.SK).startsWith('H#')
    ) as { Delete: { Key: { SK: string } } } | undefined;

    expect(mediaHashDelete).toBeDefined();
    expect(mediaHashDelete?.Delete.Key.SK).toBe(
      buildMediaHashIndexSk(
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'file-1'
      )
    );
  });

  it('restores MEDIA_HASH_INDEX record for restored media file', async () => {
    sendMock.mockResolvedValue({});

    const { restoreFileNodeFromTrash } = await import('../lib/repository.js');
    await restoreFileNodeFromTrash({
      userId: 'user-1',
      dockspaceId: 'dock-1',
      fileNode: {
        ...baseFileNode(),
        deletedAt: '2026-02-10T00:00:00.000Z',
        flaggedForDeleteAt: '2026-03-10T00:00:00.000Z',
        trashedPath: '/photo.jpg'
      },
      parentFolderNodeId: 'root',
      fileName: 'photo.jpg',
      nowIso: '2026-02-15T10:00:00.000Z'
    });

    const transactItems = getTransactItems(0);
    const mediaHashPut = transactItems.find((item) =>
      String((item as { Put?: { Item?: { type?: string } } }).Put?.Item?.type) === 'MEDIA_HASH_INDEX'
    ) as { Put: { Item: { SK: string } } } | undefined;

    expect(mediaHashPut).toBeDefined();
    expect(mediaHashPut?.Put.Item.SK).toBe(
      buildMediaHashIndexSk(
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'file-1'
      )
    );
  });
});
