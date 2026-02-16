import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildFilePk,
  buildFileStateIndexSk,
  buildPurgeDueGsi1Sk,
  PURGE_DUE_GSI1_PK
} from '../domain/keys.js';
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
    const stateIndexPut = command.input.TransactItems[1] as {
      Put: { Item: { SK: string; state: string } };
    };

    expect(update.UpdateExpression).toContain('GSI1PK = :gsi1pk');
    expect(update.UpdateExpression).toContain('GSI1SK = :gsi1sk');
    expect(update.ExpressionAttributeValues[':gsi1pk']).toBe(PURGE_DUE_GSI1_PK);
    expect(update.ExpressionAttributeValues[':gsi1sk']).toBe(
      buildPurgeDueGsi1Sk(flaggedForDeleteAt, buildFilePk('user-1', 'dock-1'), fileNode.SK)
    );
    expect(stateIndexPut.Put.Item.state).toBe('TRASH');
    expect(stateIndexPut.Put.Item.SK).toBe(
      buildFileStateIndexSk('TRASH', flaggedForDeleteAt, 'file-1')
    );
  });

  it('removes GSI keys when restoring a trashed file node', async () => {
    sendMock.mockResolvedValue({});

    const { restoreFileNodeFromTrash } = await import('../lib/repository.js');

    await restoreFileNodeFromTrash({
      userId: 'user-1',
      dockspaceId: 'dock-1',
      fileNode: {
        ...baseFileNode(),
        deletedAt: '2026-02-10T00:00:00.000Z',
        flaggedForDeleteAt: '2026-03-10T00:00:00.000Z',
        trashedPath: '/report.txt'
      },
      parentFolderNodeId: 'root',
      fileName: 'report.txt',
      nowIso: '2026-02-15T10:00:00.000Z'
    });

    const command = sendMock.mock.calls[0]?.[0] as { input: { TransactItems: unknown[] } };
    const update = (command.input.TransactItems[0] as { Update: { UpdateExpression: string } }).Update;
    const stateIndexDelete = command.input.TransactItems[2] as {
      Delete: { Key: { SK: string } };
    };

    expect(update.UpdateExpression).toContain('REMOVE deletedAt, flaggedForDeleteAt, purgedAt, trashedPath, GSI1PK, GSI1SK');
    expect(stateIndexDelete.Delete.Key.SK).toBe(
      buildFileStateIndexSk('TRASH', '2026-03-10T00:00:00.000Z', 'file-1')
    );
  });

  it('removes GSI keys when marking a file node as purged', async () => {
    sendMock.mockResolvedValue({});

    const { markFileNodePurged } = await import('../lib/repository.js');

    await markFileNodePurged({
      userId: 'user-1',
      dockspaceId: 'dock-1',
      fileNode: {
        ...baseFileNode(),
        deletedAt: '2026-02-10T00:00:00.000Z',
        flaggedForDeleteAt: '2026-03-10T00:00:00.000Z',
        trashedPath: '/report.txt'
      },
      nowIso: '2026-02-15T10:00:00.000Z'
    });

    const command = sendMock.mock.calls[0]?.[0] as { input: { TransactItems: unknown[] } };
    const update = (command.input.TransactItems[0] as { Update: { UpdateExpression: string } }).Update;
    const purgedStateIndexPut = command.input.TransactItems[1] as {
      Put: { Item: { SK: string; state: string } };
    };
    const trashStateIndexDelete = command.input.TransactItems[2] as {
      Delete: { Key: { SK: string } };
    };

    expect(update.UpdateExpression).toContain('REMOVE GSI1PK, GSI1SK');
    expect(purgedStateIndexPut.Put.Item.state).toBe('PURGED');
    expect(purgedStateIndexPut.Put.Item.SK).toBe(
      buildFileStateIndexSk('PURGED', '2026-02-15T10:00:00.000Z', 'file-1')
    );
    expect(trashStateIndexDelete.Delete.Key.SK).toBe(
      buildFileStateIndexSk('TRASH', '2026-03-10T00:00:00.000Z', 'file-1')
    );
  });

  it('removes GSI keys when upserting an existing file back to active', async () => {
    sendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Items: [baseDirectory()]
      })
      .mockResolvedValueOnce({
        Item: {
          ...baseFileNode(),
          deletedAt: '2026-02-10T00:00:00.000Z',
          flaggedForDeleteAt: '2026-03-10T00:00:00.000Z'
        }
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

    const command = sendMock.mock.calls[3]?.[0] as { input: { TransactItems: unknown[] } };
    const fileNodeUpdate = (command.input.TransactItems[0] as { Update: { UpdateExpression: string } }).Update;
    const staleStateIndexDelete = command.input.TransactItems[2] as {
      Delete: { Key: { SK: string } };
    };

    expect(fileNodeUpdate.UpdateExpression).toContain(
      'REMOVE deletedAt, flaggedForDeleteAt, purgedAt, trashedPath, GSI1PK, GSI1SK'
    );
    expect(staleStateIndexDelete.Delete.Key.SK).toBe(
      buildFileStateIndexSk('TRASH', '2026-03-10T00:00:00.000Z', 'file-1')
    );
  });
});
