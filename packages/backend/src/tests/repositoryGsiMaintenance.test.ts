import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFilePk, buildPurgeDueGsi1Sk, PURGE_DUE_GSI1_PK } from '../domain/keys.js';
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
  name: 'report.txt',
  size: 123,
  contentType: 'text/plain',
  etag: 'etag-1',
  createdAt: '2026-02-15T00:00:00.000Z',
  updatedAt: '2026-02-15T00:00:00.000Z'
});

const baseDirectory = (): DirectoryItem => ({
  PK: 'U#user-1#S#dock-1',
  SK: 'D#root#L#report.txt#file-1',
  type: 'DIRECTORY',
  name: 'report.txt',
  normalizedName: 'report.txt',
  childId: 'file-1',
  childType: 'file',
  parentFolderNodeId: 'root',
  createdAt: '2026-02-15T00:00:00.000Z',
  updatedAt: '2026-02-15T00:00:00.000Z'
});

beforeEach(() => {
  process.env.TABLE_NAME = 'table';
  process.env.BUCKET_NAME = 'bucket';
  sendMock.mockReset();
  vi.resetModules();
});

describe('repository GSI maintenance on file state transitions', () => {
  it('sets purge-due GSI keys when trashing a file node', async () => {
    sendMock.mockResolvedValue({});

    const { markResolvedFileNodeTrashed } = await import('../lib/repository.js');
    const fileNode = baseFileNode();
    const directory = baseDirectory();
    const nowIso = '2026-02-15T10:00:00.000Z';
    const flaggedForDeleteAt = '2026-03-17T10:00:00.000Z';

    await markResolvedFileNodeTrashed(
      'user-1',
      'dock-1',
      {
        fullPath: '/report.txt',
        folderPath: '/',
        fileNode,
        directory
      },
      nowIso,
      flaggedForDeleteAt
    );

    const command = sendMock.mock.calls[0]?.[0] as { input: { TransactItems: unknown[] } };
    const update = (command.input.TransactItems[0] as { Update: { UpdateExpression: string; ExpressionAttributeValues: Record<string, string> } }).Update;

    expect(update.UpdateExpression).toContain('GSI1PK = :gsi1pk');
    expect(update.UpdateExpression).toContain('GSI1SK = :gsi1sk');
    expect(update.ExpressionAttributeValues[':gsi1pk']).toBe(PURGE_DUE_GSI1_PK);
    expect(update.ExpressionAttributeValues[':gsi1sk']).toBe(
      buildPurgeDueGsi1Sk(flaggedForDeleteAt, buildFilePk('user-1', 'dock-1'), fileNode.SK)
    );
  });

  it('removes GSI keys when restoring a trashed file node', async () => {
    sendMock.mockResolvedValue({});

    const { restoreFileNodeFromTrash } = await import('../lib/repository.js');

    await restoreFileNodeFromTrash({
      userId: 'user-1',
      dockspaceId: 'dock-1',
      fileNode: baseFileNode(),
      parentFolderNodeId: 'root',
      fileName: 'report.txt',
      nowIso: '2026-02-15T10:00:00.000Z'
    });

    const command = sendMock.mock.calls[0]?.[0] as { input: { TransactItems: unknown[] } };
    const update = (command.input.TransactItems[0] as { Update: { UpdateExpression: string } }).Update;

    expect(update.UpdateExpression).toContain('REMOVE deletedAt, flaggedForDeleteAt, purgedAt, trashedPath, GSI1PK, GSI1SK');
  });

  it('removes GSI keys when marking a file node as purged', async () => {
    sendMock.mockResolvedValue({});

    const { markFileNodePurged } = await import('../lib/repository.js');

    await markFileNodePurged({
      userId: 'user-1',
      dockspaceId: 'dock-1',
      fileNode: baseFileNode(),
      nowIso: '2026-02-15T10:00:00.000Z'
    });

    const command = sendMock.mock.calls[0]?.[0] as { input: { TransactItems: unknown[] } };
    const update = (command.input.TransactItems[0] as { Update: { UpdateExpression: string } }).Update;

    expect(update.UpdateExpression).toContain('REMOVE GSI1PK, GSI1SK');
  });

  it('removes GSI keys when upserting an existing file back to active', async () => {
    sendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Items: [baseDirectory()]
      })
      .mockResolvedValueOnce({});

    const { upsertActiveFileByPath } = await import('../lib/repository.js');

    await upsertActiveFileByPath({
      userId: 'user-1',
      dockspaceId: 'dock-1',
      fullPath: '/report.txt',
      s3Key: 'user-1/dockspaces/dock-1/files/file-1',
      size: 234,
      contentType: 'text/plain',
      etag: 'etag-2',
      nowIso: '2026-02-15T10:00:00.000Z'
    });

    const command = sendMock.mock.calls[2]?.[0] as { input: { TransactItems: unknown[] } };
    const fileNodeUpdate = (command.input.TransactItems[0] as { Update: { UpdateExpression: string } }).Update;

    expect(fileNodeUpdate.UpdateExpression).toContain(
      'REMOVE deletedAt, flaggedForDeleteAt, purgedAt, GSI1PK, GSI1SK'
    );
  });
});
