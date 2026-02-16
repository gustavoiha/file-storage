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

describe('backfillFileStateIndex', () => {
  it('creates trash and purged state-index records for eligible file nodes', async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'U#u1#S#d1',
            SK: 'L#file-1',
            type: 'FILE_NODE',
            size: 123,
            trashedPath: '/report.txt',
            deletedAt: '2026-01-01T00:00:00.000Z',
            flaggedForDeleteAt: '2026-02-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z'
          },
          {
            PK: 'U#u1#S#d1',
            SK: 'L#file-2',
            type: 'FILE_NODE',
            trashedPath: '/old.txt',
            purgedAt: '2026-01-05T00:00:00.000Z',
            updatedAt: '2026-01-05T00:00:00.000Z'
          }
        ]
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const { backfillFileStateIndex } = await import('../lib/backfillFileStateIndex.js');
    const result = await backfillFileStateIndex({ dryRun: false, pageSize: 25 });

    expect(result.eligibleTrashCount).toBe(1);
    expect(result.eligiblePurgedCount).toBe(1);
    expect(result.createdCount).toBe(2);
    expect(sendMock).toHaveBeenCalledTimes(3);

    const firstPut = sendMock.mock.calls[1]?.[0] as {
      input: { Item: { SK: string; state: string } };
    };
    const secondPut = sendMock.mock.calls[2]?.[0] as {
      input: { Item: { SK: string; state: string } };
    };

    expect(firstPut.input.Item.state).toBe('TRASH');
    expect(firstPut.input.Item.SK).toBe('X#TRASH#2026-02-01T00:00:00.000Z#file-1');
    expect(secondPut.input.Item.state).toBe('PURGED');
    expect(secondPut.input.Item.SK).toBe('X#PURGED#2026-01-05T00:00:00.000Z#file-2');
  });

  it('tracks already-existing state records through conditional failures', async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'U#u1#S#d1',
            SK: 'L#file-1',
            type: 'FILE_NODE',
            size: 123,
            trashedPath: '/report.txt',
            deletedAt: '2026-01-01T00:00:00.000Z',
            flaggedForDeleteAt: '2026-02-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z'
          }
        ]
      })
      .mockRejectedValueOnce(
        Object.assign(new Error('conditional'), { name: 'ConditionalCheckFailedException' })
      );

    const { backfillFileStateIndex } = await import('../lib/backfillFileStateIndex.js');
    const result = await backfillFileStateIndex({ dryRun: false });

    expect(result.createdCount).toBe(0);
    expect(result.alreadyExistsCount).toBe(1);
  });

  it('supports dry-run mode with no writes', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        {
          PK: 'U#u1#S#d1',
          SK: 'L#file-1',
          type: 'FILE_NODE',
          size: 123,
          trashedPath: '/report.txt',
          deletedAt: '2026-01-01T00:00:00.000Z',
          flaggedForDeleteAt: '2026-02-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ]
    });

    const { backfillFileStateIndex } = await import('../lib/backfillFileStateIndex.js');
    const result = await backfillFileStateIndex({ dryRun: true });

    expect(result.createdCount).toBe(0);
    expect(result.dryRunCreateCount).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
