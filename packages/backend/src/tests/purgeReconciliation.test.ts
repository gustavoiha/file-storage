import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  sendMock,
  purgeObjectVersionsMock,
  purgeObjectVersionsByPrefixMock,
  buildThumbnailObjectPrefixMock,
  markFileNodePurgedMock
} = vi.hoisted(() => ({
  sendMock: vi.fn(),
  purgeObjectVersionsMock: vi.fn(),
  purgeObjectVersionsByPrefixMock: vi.fn(),
  buildThumbnailObjectPrefixMock: vi.fn(),
  markFileNodePurgedMock: vi.fn()
}));

vi.mock('../lib/clients.js', () => ({
  dynamoDoc: {
    send: sendMock
  }
}));

vi.mock('../lib/s3.js', () => ({
  purgeObjectVersions: purgeObjectVersionsMock,
  purgeObjectVersionsByPrefix: purgeObjectVersionsByPrefixMock,
  buildThumbnailObjectPrefix: buildThumbnailObjectPrefixMock
}));

vi.mock('../lib/repository.js', () => ({
  markFileNodePurged: markFileNodePurgedMock
}));

beforeEach(() => {
  process.env.TABLE_NAME = 'table';
  process.env.BUCKET_NAME = 'bucket';
  sendMock.mockReset();
  purgeObjectVersionsMock.mockReset();
  purgeObjectVersionsByPrefixMock.mockReset();
  buildThumbnailObjectPrefixMock.mockReset();
  markFileNodePurgedMock.mockReset();
  buildThumbnailObjectPrefixMock.mockImplementation(
    (dockspaceId: string, fileNodeId: string) => `${dockspaceId}/thumbnails/${fileNodeId}/`
  );
  vi.useRealTimers();
  vi.resetModules();
});

describe('purgeReconciliation handler', () => {
  it('queries GSI1 due items and marks purged only when no versions remain', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T12:00:00.000Z'));

    sendMock.mockResolvedValueOnce({
      Items: [
        {
          PK: 'U#user-1#S#dock-1',
          SK: 'L#file-1',
          s3Key: 'key-1'
        },
        {
          PK: 'U#user-2#S#dock-2',
          SK: 'L#file-2',
          s3Key: 'key-2'
        }
      ]
    });
    sendMock
      .mockResolvedValueOnce({
        Item: {
          PK: 'U#user-1#S#dock-1',
          SK: 'L#file-1',
          s3Key: 'key-1',
          deletedAt: '2026-02-01T00:00:00.000Z',
          flaggedForDeleteAt: '2026-02-15T00:00:00.000Z'
        }
      })
      .mockResolvedValueOnce({
        Item: {
          PK: 'U#user-2#S#dock-2',
          SK: 'L#file-2',
          s3Key: 'key-2',
          deletedAt: '2026-02-01T00:00:00.000Z',
          flaggedForDeleteAt: '2026-02-15T00:00:00.000Z'
        }
      });
    purgeObjectVersionsMock
      .mockResolvedValueOnce({
        discoveredVersionCount: 2,
        deletedVersionCount: 1,
        remainingVersionCount: 1
      })
      .mockResolvedValueOnce({
        discoveredVersionCount: 2,
        deletedVersionCount: 2,
        remainingVersionCount: 0
      });
    purgeObjectVersionsByPrefixMock.mockResolvedValue({
      discoveredVersionCount: 1,
      deletedVersionCount: 1,
      remainingVersionCount: 0
    });
    markFileNodePurgedMock.mockResolvedValue(undefined);

    const { handler } = await import('../handlers/purgeReconciliation.js');
    const response = await handler({} as never);

    expect(sendMock).toHaveBeenCalledTimes(3);

    const queryCommand = sendMock.mock.calls[0]?.[0] as {
      input: { IndexName: string; KeyConditionExpression: string; ExpressionAttributeValues: Record<string, string> };
    };
    expect(queryCommand.input.IndexName).toBe('GSI1');
    expect(queryCommand.input.KeyConditionExpression).toBe(
      'GSI1PK = :gsi1pk AND GSI1SK <= :upperBoundNow'
    );
    expect(queryCommand.input.ExpressionAttributeValues[':gsi1pk']).toBe('PURGE_DUE');
    expect(queryCommand.input.ExpressionAttributeValues[':upperBoundNow']).toBe(
      '2026-02-15T12:00:00.000Z#~'
    );

    expect(purgeObjectVersionsMock).toHaveBeenCalledTimes(2);
    expect(purgeObjectVersionsByPrefixMock).toHaveBeenCalledTimes(1);
    expect(buildThumbnailObjectPrefixMock).toHaveBeenCalledWith('dock-2', 'file-2');
    expect(markFileNodePurgedMock).toHaveBeenCalledTimes(1);
    expect(markFileNodePurgedMock).toHaveBeenCalledWith({
      userId: 'user-2',
      dockspaceId: 'dock-2',
      fileNode: expect.objectContaining({
        PK: 'U#user-2#S#dock-2',
        SK: 'L#file-2',
        s3Key: 'key-2'
      }),
      nowIso: '2026-02-15T12:00:00.000Z'
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(JSON.stringify({ processed: 1 }));
  });

  it('processes all GSI query pages', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T12:00:00.000Z'));

    sendMock
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'U#user-1#S#dock-1',
            SK: 'L#file-1',
            s3Key: 'key-1'
          }
        ],
        LastEvaluatedKey: {
          PK: 'U#user-1#S#dock-1',
          SK: 'L#file-1'
        }
      })
      .mockResolvedValueOnce({
        Item: {
          PK: 'U#user-1#S#dock-1',
          SK: 'L#file-1',
          s3Key: 'key-1',
          deletedAt: '2026-02-01T00:00:00.000Z',
          flaggedForDeleteAt: '2026-02-15T00:00:00.000Z'
        }
      })
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'U#user-2#S#dock-2',
            SK: 'L#file-2',
            s3Key: 'key-2'
          }
        ]
      })
      .mockResolvedValueOnce({
        Item: {
          PK: 'U#user-2#S#dock-2',
          SK: 'L#file-2',
          s3Key: 'key-2',
          deletedAt: '2026-02-01T00:00:00.000Z',
          flaggedForDeleteAt: '2026-02-15T00:00:00.000Z'
        }
      });

    purgeObjectVersionsMock.mockResolvedValue({
      discoveredVersionCount: 1,
      deletedVersionCount: 1,
      remainingVersionCount: 0
    });
    purgeObjectVersionsByPrefixMock.mockResolvedValue({
      discoveredVersionCount: 0,
      deletedVersionCount: 0,
      remainingVersionCount: 0
    });
    markFileNodePurgedMock.mockResolvedValue(undefined);

    const { handler } = await import('../handlers/purgeReconciliation.js');
    await handler({} as never);

    expect(sendMock).toHaveBeenCalledTimes(4);

    const firstQuery = sendMock.mock.calls[0]?.[0] as { input: { ExclusiveStartKey?: unknown } };
    const secondQuery = sendMock.mock.calls[2]?.[0] as { input: { ExclusiveStartKey?: unknown } };

    expect(firstQuery.input.ExclusiveStartKey).toBeUndefined();
    expect(secondQuery.input.ExclusiveStartKey).toEqual({
      PK: 'U#user-1#S#dock-1',
      SK: 'L#file-1'
    });

    expect(markFileNodePurgedMock).toHaveBeenCalledTimes(2);
    expect(purgeObjectVersionsByPrefixMock).toHaveBeenCalledTimes(2);
  });

  it('skips items with invalid partition keys', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T12:00:00.000Z'));

    sendMock.mockResolvedValueOnce({
      Items: [
        {
          PK: 'invalid',
          SK: 'L#file-1',
          s3Key: 'key-1'
        }
      ]
    });

    const { handler } = await import('../handlers/purgeReconciliation.js');
    const response = await handler({} as never);

    expect(purgeObjectVersionsMock).not.toHaveBeenCalled();
    expect(purgeObjectVersionsByPrefixMock).not.toHaveBeenCalled();
    expect(markFileNodePurgedMock).not.toHaveBeenCalled();
    expect(response.body).toBe(JSON.stringify({ processed: 0 }));
  });

  it('skips stale GSI items that are no longer trashed on a consistent read', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T12:00:00.000Z'));

    sendMock
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'U#user-1#S#dock-1',
            SK: 'L#file-1',
            s3Key: 'key-1'
          }
        ]
      })
      .mockResolvedValueOnce({
        Item: {
          PK: 'U#user-1#S#dock-1',
          SK: 'L#file-1',
          s3Key: 'key-1'
        }
      });

    const { handler } = await import('../handlers/purgeReconciliation.js');
    const response = await handler({} as never);

    expect(purgeObjectVersionsMock).not.toHaveBeenCalled();
    expect(purgeObjectVersionsByPrefixMock).not.toHaveBeenCalled();
    expect(markFileNodePurgedMock).not.toHaveBeenCalled();
    expect(response.body).toBe(JSON.stringify({ processed: 0 }));
  });

  it('skips mark as purged when thumbnail versions remain', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T12:00:00.000Z'));

    sendMock
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'U#user-1#S#dock-1',
            SK: 'L#file-1',
            s3Key: 'key-1'
          }
        ]
      })
      .mockResolvedValueOnce({
        Item: {
          PK: 'U#user-1#S#dock-1',
          SK: 'L#file-1',
          s3Key: 'key-1',
          deletedAt: '2026-02-01T00:00:00.000Z',
          flaggedForDeleteAt: '2026-02-15T00:00:00.000Z'
        }
      });
    purgeObjectVersionsMock.mockResolvedValue({
      discoveredVersionCount: 1,
      deletedVersionCount: 1,
      remainingVersionCount: 0
    });
    purgeObjectVersionsByPrefixMock.mockResolvedValue({
      discoveredVersionCount: 2,
      deletedVersionCount: 1,
      remainingVersionCount: 1
    });

    const { handler } = await import('../handlers/purgeReconciliation.js');
    const response = await handler({} as never);

    expect(response.body).toBe(JSON.stringify({ processed: 0 }));
    expect(markFileNodePurgedMock).not.toHaveBeenCalled();
  });
});
