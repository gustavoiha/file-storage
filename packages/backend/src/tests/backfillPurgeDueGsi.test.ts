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

describe('backfillPurgeDueGsi', () => {
  it('updates eligible trashed records missing purge-due GSI keys', async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'U#u1#S#d1',
            SK: 'L#file-1',
            type: 'FILE_NODE',
            deletedAt: '2026-01-01T00:00:00.000Z',
            flaggedForDeleteAt: '2026-02-01T00:00:00.000Z'
          }
        ]
      })
      .mockResolvedValueOnce({});

    const { backfillPurgeDueGsi } = await import('../lib/backfillPurgeDueGsi.js');
    const result = await backfillPurgeDueGsi({ dryRun: false, pageSize: 25 });

    expect(result.updatedCount).toBe(1);
    expect(result.eligibleCount).toBe(1);
    expect(result.alreadyIndexedCount).toBe(0);
    expect(sendMock).toHaveBeenCalledTimes(2);

    const updateCommand = sendMock.mock.calls[1]?.[0] as {
      input: { UpdateExpression: string; ExpressionAttributeValues: Record<string, string> };
    };
    expect(updateCommand.input.UpdateExpression).toBe('SET GSI1PK = :gsi1pk, GSI1SK = :gsi1sk');
    expect(updateCommand.input.ExpressionAttributeValues[':gsi1pk']).toBe('PURGE_DUE');
    expect(updateCommand.input.ExpressionAttributeValues[':gsi1sk']).toBe(
      '2026-02-01T00:00:00.000Z#U#u1#S#d1#L#file-1'
    );
  });

  it('does not mutate active or purged records', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        {
          PK: 'U#u1#S#d1',
          SK: 'L#active-1',
          type: 'FILE_NODE'
        },
        {
          PK: 'U#u1#S#d1',
          SK: 'L#purged-1',
          type: 'FILE_NODE',
          deletedAt: '2026-01-01T00:00:00.000Z',
          flaggedForDeleteAt: '2026-02-01T00:00:00.000Z',
          purgedAt: '2026-01-05T00:00:00.000Z'
        }
      ]
    });

    const { backfillPurgeDueGsi } = await import('../lib/backfillPurgeDueGsi.js');
    const result = await backfillPurgeDueGsi({ dryRun: false });

    expect(result.updatedCount).toBe(0);
    expect(result.eligibleCount).toBe(0);
    expect(result.skippedIneligibleCount).toBe(2);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('skips records that are already correctly indexed', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        {
          PK: 'U#u1#S#d1',
          SK: 'L#file-1',
          type: 'FILE_NODE',
          deletedAt: '2026-01-01T00:00:00.000Z',
          flaggedForDeleteAt: '2026-02-01T00:00:00.000Z',
          GSI1PK: 'PURGE_DUE',
          GSI1SK: '2026-02-01T00:00:00.000Z#U#u1#S#d1#L#file-1'
        }
      ]
    });

    const { backfillPurgeDueGsi } = await import('../lib/backfillPurgeDueGsi.js');
    const result = await backfillPurgeDueGsi({ dryRun: false });

    expect(result.updatedCount).toBe(0);
    expect(result.alreadyIndexedCount).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('supports dry-run mode without writing updates', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        {
          PK: 'U#u1#S#d1',
          SK: 'L#file-1',
          type: 'FILE_NODE',
          deletedAt: '2026-01-01T00:00:00.000Z',
          flaggedForDeleteAt: '2026-02-01T00:00:00.000Z'
        }
      ]
    });

    const { backfillPurgeDueGsi } = await import('../lib/backfillPurgeDueGsi.js');
    const result = await backfillPurgeDueGsi({ dryRun: true });

    expect(result.updatedCount).toBe(0);
    expect(result.dryRunUpdateCount).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
