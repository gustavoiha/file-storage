import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock, objectExistsMock, markFileNodePurgedMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  objectExistsMock: vi.fn(),
  markFileNodePurgedMock: vi.fn()
}));

vi.mock('../lib/clients.js', () => ({
  dynamoDoc: {
    send: sendMock
  }
}));

vi.mock('../lib/s3.js', () => ({
  objectExists: objectExistsMock
}));

vi.mock('../lib/repository.js', () => ({
  markFileNodePurged: markFileNodePurgedMock
}));

beforeEach(() => {
  process.env.TABLE_NAME = 'table';
  process.env.BUCKET_NAME = 'bucket';
  sendMock.mockReset();
  objectExistsMock.mockReset();
  markFileNodePurgedMock.mockReset();
  vi.useRealTimers();
  vi.resetModules();
});

describe('purgeReconciliation handler', () => {
  it('queries GSI1 due items and purges only missing objects', async () => {
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
    objectExistsMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    markFileNodePurgedMock.mockResolvedValue(undefined);

    const { handler } = await import('../handlers/purgeReconciliation.js');
    const response = await handler({} as never);

    expect(sendMock).toHaveBeenCalledTimes(1);

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

    expect(objectExistsMock).toHaveBeenCalledTimes(2);
    expect(markFileNodePurgedMock).toHaveBeenCalledTimes(1);
    expect(markFileNodePurgedMock).toHaveBeenCalledWith({
      userId: 'user-2',
      dockspaceId: 'dock-2',
      fileNode: {
        PK: 'U#user-2#S#dock-2',
        SK: 'L#file-2',
        s3Key: 'key-2'
      },
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
        Items: [
          {
            PK: 'U#user-2#S#dock-2',
            SK: 'L#file-2',
            s3Key: 'key-2'
          }
        ]
      });

    objectExistsMock.mockResolvedValue(false);
    markFileNodePurgedMock.mockResolvedValue(undefined);

    const { handler } = await import('../handlers/purgeReconciliation.js');
    await handler({} as never);

    expect(sendMock).toHaveBeenCalledTimes(2);

    const firstQuery = sendMock.mock.calls[0]?.[0] as { input: { ExclusiveStartKey?: unknown } };
    const secondQuery = sendMock.mock.calls[1]?.[0] as { input: { ExclusiveStartKey?: unknown } };

    expect(firstQuery.input.ExclusiveStartKey).toBeUndefined();
    expect(secondQuery.input.ExclusiveStartKey).toEqual({
      PK: 'U#user-1#S#dock-1',
      SK: 'L#file-1'
    });

    expect(markFileNodePurgedMock).toHaveBeenCalledTimes(2);
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

    expect(objectExistsMock).not.toHaveBeenCalled();
    expect(markFileNodePurgedMock).not.toHaveBeenCalled();
    expect(response.body).toBe(JSON.stringify({ processed: 0 }));
  });
});
