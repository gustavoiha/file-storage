import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn()
}));

vi.mock('../lib/clients.js', () => ({
  dynamoDoc: {
    send: sendMock
  }
}));

beforeEach(() => {
  process.env.TABLE_NAME = 'table';
  process.env.BUCKET_NAME = 'bucket';
  sendMock.mockReset();
  vi.resetModules();
});

describe('backfillMediaHashIndex', () => {
  it('creates index rows for eligible active media nodes', async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'U#u1#S#d1',
            SK: 'L#file-1',
            type: 'FILE_NODE',
            contentHash: 'abc123',
            contentType: 'image/jpeg',
            updatedAt: '2026-02-17T00:00:00.000Z'
          }
        ]
      })
      .mockResolvedValueOnce({});

    const { backfillMediaHashIndex } = await import('../lib/backfillMediaHashIndex.js');
    const result = await backfillMediaHashIndex({ dryRun: false, pageSize: 25 });

    expect(result.eligibleCount).toBe(1);
    expect(result.insertedCount).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(2);

    const putCommand = sendMock.mock.calls[1]?.[0] as {
      input: { Item: { SK: string; type: string; fileNodeId: string } };
    };
    expect(putCommand.input.Item.type).toBe('MEDIA_HASH_INDEX');
    expect(putCommand.input.Item.SK).toBe('H#abc123#L#file-1');
    expect(putCommand.input.Item.fileNodeId).toBe('file-1');
  });

  it('skips non-media content types', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        {
          PK: 'U#u1#S#d1',
          SK: 'L#file-1',
          type: 'FILE_NODE',
          contentHash: 'abc123',
          contentType: 'application/pdf',
          updatedAt: '2026-02-17T00:00:00.000Z'
        }
      ]
    });

    const { backfillMediaHashIndex } = await import('../lib/backfillMediaHashIndex.js');
    const result = await backfillMediaHashIndex({ dryRun: false });

    expect(result.eligibleCount).toBe(0);
    expect(result.skippedIneligibleCount).toBe(1);
    expect(result.insertedCount).toBe(0);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('tracks already-existing rows through conditional failures', async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'U#u1#S#d1',
            SK: 'L#file-1',
            type: 'FILE_NODE',
            contentHash: 'abc123',
            contentType: 'image/jpeg',
            updatedAt: '2026-02-17T00:00:00.000Z'
          }
        ]
      })
      .mockRejectedValueOnce(
        Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' })
      );

    const { backfillMediaHashIndex } = await import('../lib/backfillMediaHashIndex.js');
    const result = await backfillMediaHashIndex({ dryRun: false });

    expect(result.insertedCount).toBe(0);
    expect(result.alreadyExistsCount).toBe(1);
  });
});
