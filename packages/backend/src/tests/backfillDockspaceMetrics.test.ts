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

describe('backfillDockspaceMetrics', () => {
  it('builds and writes dockspace metrics records from non-purged files', async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'U#user-1',
            SK: 'S#dock-1',
            type: 'DOCKSPACE',
            userId: 'user-1',
            dockspaceId: 'dock-1',
            name: 'Main',
            createdAt: '2026-01-01T00:00:00.000Z'
          }
        ]
      })
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'U#user-1#S#dock-1',
            SK: 'L#file-1',
            type: 'FILE_NODE',
            size: 100,
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-03T00:00:00.000Z'
          },
          {
            PK: 'U#user-1#S#dock-1',
            SK: 'L#file-2',
            type: 'FILE_NODE',
            size: 50,
            createdAt: '2026-01-04T00:00:00.000Z',
            updatedAt: '2026-01-05T00:00:00.000Z'
          }
        ]
      })
      .mockResolvedValueOnce({});

    const { backfillDockspaceMetrics } = await import('../lib/backfillDockspaceMetrics.js');
    const result = await backfillDockspaceMetrics({ dryRun: false });

    expect(result.scannedDockspaceCount).toBe(1);
    expect(result.metricsPreparedCount).toBe(1);
    expect(result.metricsWrittenCount).toBe(1);

    const putCommand = sendMock.mock.calls[2]?.[0] as {
      input: {
        Item: {
          SK: string;
          type: string;
          totalFileCount: number;
          totalSizeBytes: number;
          lastUploadAt: string;
        };
      };
    };

    expect(putCommand.input.Item.type).toBe('DOCKSPACE_METRICS');
    expect(putCommand.input.Item.SK).toBe('M#S#dock-1');
    expect(putCommand.input.Item.totalFileCount).toBe(2);
    expect(putCommand.input.Item.totalSizeBytes).toBe(150);
    expect(putCommand.input.Item.lastUploadAt).toBe('2026-01-05T00:00:00.000Z');
  });

  it('supports dry-run without writes', async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'U#user-1',
            SK: 'S#dock-1',
            type: 'DOCKSPACE',
            userId: 'user-1',
            dockspaceId: 'dock-1',
            name: 'Main',
            createdAt: '2026-01-01T00:00:00.000Z'
          }
        ]
      })
      .mockResolvedValueOnce({
        Items: []
      });

    const { backfillDockspaceMetrics } = await import('../lib/backfillDockspaceMetrics.js');
    const result = await backfillDockspaceMetrics({ dryRun: true });

    expect(result.metricsPreparedCount).toBe(1);
    expect(result.metricsWrittenCount).toBe(0);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});
