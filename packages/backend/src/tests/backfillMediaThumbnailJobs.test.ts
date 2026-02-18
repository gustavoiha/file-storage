import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock, enqueueThumbnailJobMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  enqueueThumbnailJobMock: vi.fn()
}));

vi.mock('../lib/clients.js', () => ({
  dynamoDoc: {
    send: sendMock
  }
}));

vi.mock('../lib/thumbnailQueue.js', () => ({
  buildThumbnailJob: vi.fn((payload) => ({
    ...payload,
    version: 1,
    jobType: 'GENERATE_THUMBNAIL',
    attempt: payload.attempt ?? 1,
    requestedAt: payload.requestedAt ?? '2026-02-18T00:00:00.000Z'
  })),
  enqueueThumbnailJob: enqueueThumbnailJobMock
}));

beforeEach(() => {
  process.env.TABLE_NAME = 'table';
  process.env.BUCKET_NAME = 'bucket';
  process.env.THUMBNAIL_QUEUE_URL = 'https://sqs.example/thumbnail-jobs';
  sendMock.mockReset();
  enqueueThumbnailJobMock.mockReset();
  vi.resetModules();
});

describe('backfillMediaThumbnailJobs', () => {
  it('enqueues thumbnail jobs for active media files missing thumbnails', async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'U#user-1#S#dock-1',
            SK: 'L#file-1',
            type: 'FILE_NODE',
            s3Key: 'dock-1/file-1',
            contentType: 'image/jpeg',
            etag: 'etag-1'
          }
        ]
      })
      .mockResolvedValueOnce({});

    const { backfillMediaThumbnailJobs } = await import('../lib/backfillMediaThumbnailJobs.js');
    const result = await backfillMediaThumbnailJobs({ dryRun: false, pageSize: 10 });

    expect(result.eligibleCount).toBe(1);
    expect(result.needsThumbnailCount).toBe(1);
    expect(result.enqueuedCount).toBe(1);
    expect(enqueueThumbnailJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        dockspaceId: 'dock-1',
        fileNodeId: 'file-1',
        s3Key: 'dock-1/file-1',
        contentType: 'image/jpeg',
        etag: 'etag-1'
      })
    );
  });

  it('skips files with ready thumbnails matching current etag', async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'U#user-1#S#dock-1',
            SK: 'L#file-1',
            type: 'FILE_NODE',
            s3Key: 'dock-1/file-1',
            contentType: 'video/mp4',
            etag: 'etag-1'
          }
        ]
      })
      .mockResolvedValueOnce({
        Item: {
          status: 'READY',
          sourceEtag: 'etag-1',
          thumbnailKey: 'dock-1/thumbnails/file-1/v-etag-1.jpg'
        }
      });

    const { backfillMediaThumbnailJobs } = await import('../lib/backfillMediaThumbnailJobs.js');
    const result = await backfillMediaThumbnailJobs({ dryRun: false });

    expect(result.eligibleCount).toBe(1);
    expect(result.needsThumbnailCount).toBe(0);
    expect(result.alreadyUpToDateCount).toBe(1);
    expect(result.enqueuedCount).toBe(0);
    expect(enqueueThumbnailJobMock).not.toHaveBeenCalled();
  });

  it('counts dry-run enqueue candidates without enqueueing', async () => {
    sendMock
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'U#user-1#S#dock-1',
            SK: 'L#file-1',
            type: 'FILE_NODE',
            s3Key: 'dock-1/file-1',
            contentType: 'video/mp4',
            etag: 'etag-1'
          }
        ]
      })
      .mockResolvedValueOnce({});

    const { backfillMediaThumbnailJobs } = await import('../lib/backfillMediaThumbnailJobs.js');
    const result = await backfillMediaThumbnailJobs({ dryRun: true });

    expect(result.needsThumbnailCount).toBe(1);
    expect(result.dryRunEnqueueCount).toBe(1);
    expect(result.enqueuedCount).toBe(0);
    expect(enqueueThumbnailJobMock).not.toHaveBeenCalled();
  });
});
