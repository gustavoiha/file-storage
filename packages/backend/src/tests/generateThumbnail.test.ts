import type { SQSEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findFileNodeByIdMock,
  getThumbnailMetadataMock,
  upsertThumbnailMetadataMock,
  buildThumbnailObjectKeyMock,
  getObjectBytesMock,
  putObjectBytesMock,
  buildThumbnailJobMock,
  enqueueThumbnailJobMock,
  enqueueThumbnailFailureToDlqMock,
  sharpMock,
  sharpToBufferMock
} = vi.hoisted(() => ({
  findFileNodeByIdMock: vi.fn(),
  getThumbnailMetadataMock: vi.fn(),
  upsertThumbnailMetadataMock: vi.fn(),
  buildThumbnailObjectKeyMock: vi.fn(),
  getObjectBytesMock: vi.fn(),
  putObjectBytesMock: vi.fn(),
  buildThumbnailJobMock: vi.fn(),
  enqueueThumbnailJobMock: vi.fn(),
  enqueueThumbnailFailureToDlqMock: vi.fn(),
  sharpToBufferMock: vi.fn(),
  sharpMock: vi.fn()
}));

vi.mock('../lib/repository.js', () => ({
  findFileNodeById: findFileNodeByIdMock,
  getThumbnailMetadata: getThumbnailMetadataMock,
  upsertThumbnailMetadata: upsertThumbnailMetadataMock
}));

vi.mock('../lib/s3.js', () => ({
  buildThumbnailObjectKey: buildThumbnailObjectKeyMock,
  getObjectBytes: getObjectBytesMock,
  putObjectBytes: putObjectBytesMock
}));

vi.mock('../lib/thumbnailQueue.js', () => ({
  buildThumbnailJob: buildThumbnailJobMock,
  enqueueThumbnailJob: enqueueThumbnailJobMock,
  enqueueThumbnailFailureToDlq: enqueueThumbnailFailureToDlqMock
}));

vi.mock('sharp', () => ({
  default: sharpMock
}));

const baseEvent = (body: Record<string, unknown>): SQSEvent =>
  ({
    Records: [
      {
        messageId: 'msg-1',
        receiptHandle: 'receipt',
        body: JSON.stringify(body),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: '0',
          SenderId: 'sender',
          ApproximateFirstReceiveTimestamp: '0'
        },
        messageAttributes: {},
        md5OfBody: 'md5',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:123:queue',
        awsRegion: 'us-east-1'
      }
    ]
  }) as SQSEvent;

const baseJob = {
  version: 1 as const,
  jobType: 'GENERATE_THUMBNAIL' as const,
  userId: 'user-1',
  dockspaceId: 'dock-1',
  fileNodeId: 'file-1',
  s3Key: 'dock-1/file-1',
  contentType: 'image/jpeg',
  etag: 'etag-1',
  attempt: 1,
  requestedAt: '2026-02-17T00:00:00.000Z'
};

beforeEach(() => {
  process.env.TABLE_NAME = 'table';
  process.env.BUCKET_NAME = 'bucket';
  process.env.THUMBNAIL_MAX_ATTEMPTS = '8';

  findFileNodeByIdMock.mockReset();
  getThumbnailMetadataMock.mockReset();
  upsertThumbnailMetadataMock.mockReset();
  buildThumbnailObjectKeyMock.mockReset();
  getObjectBytesMock.mockReset();
  putObjectBytesMock.mockReset();
  buildThumbnailJobMock.mockReset();
  enqueueThumbnailJobMock.mockReset();
  enqueueThumbnailFailureToDlqMock.mockReset();
  sharpMock.mockReset();
  sharpToBufferMock.mockReset();

  findFileNodeByIdMock.mockResolvedValue({
    SK: 'L#file-1',
    etag: 'etag-1'
  });
  getThumbnailMetadataMock.mockResolvedValue(null);
  buildThumbnailObjectKeyMock.mockReturnValue('dock-1/thumbnails/file-1/v-etag-1.jpg');
  getObjectBytesMock.mockResolvedValue(new Uint8Array([1, 2, 3]));
  putObjectBytesMock.mockResolvedValue(undefined);
  buildThumbnailJobMock.mockImplementation((payload) => ({
    ...payload,
    version: 1,
    jobType: 'GENERATE_THUMBNAIL'
  }));
  enqueueThumbnailJobMock.mockResolvedValue(undefined);
  enqueueThumbnailFailureToDlqMock.mockResolvedValue(undefined);

  sharpMock.mockReturnValue({
    rotate: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    toBuffer: sharpToBufferMock
  });
  sharpToBufferMock.mockResolvedValue({
    data: Buffer.from([9, 9, 9]),
    info: {
      width: 64,
      height: 64,
      size: 3
    }
  });

  vi.resetModules();
});

describe('generateThumbnail handler', () => {
  it('no-ops stale jobs when etag changed', async () => {
    findFileNodeByIdMock.mockResolvedValue({
      SK: 'L#file-1',
      etag: 'etag-new'
    });

    const { handler } = await import('../handlers/generateThumbnail.js');
    await handler(baseEvent(baseJob));

    expect(upsertThumbnailMetadataMock).not.toHaveBeenCalled();
    expect(putObjectBytesMock).not.toHaveBeenCalled();
    expect(enqueueThumbnailJobMock).not.toHaveBeenCalled();
    expect(enqueueThumbnailFailureToDlqMock).not.toHaveBeenCalled();
  });

  it('marks unsupported non-image types without retry', async () => {
    const { handler } = await import('../handlers/generateThumbnail.js');
    await handler(
      baseEvent({
        ...baseJob,
        contentType: 'application/pdf'
      })
    );

    expect(upsertThumbnailMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'UNSUPPORTED',
        sourceContentType: 'application/pdf'
      })
    );
    expect(putObjectBytesMock).not.toHaveBeenCalled();
    expect(enqueueThumbnailJobMock).not.toHaveBeenCalled();
  });

  it('creates thumbnail and writes READY metadata for images', async () => {
    const { handler } = await import('../handlers/generateThumbnail.js');
    await handler(baseEvent(baseJob));

    expect(putObjectBytesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'dock-1/thumbnails/file-1/v-etag-1.jpg',
        contentType: 'image/jpeg'
      })
    );
    expect(upsertThumbnailMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'READY',
        thumbnailKey: 'dock-1/thumbnails/file-1/v-etag-1.jpg',
        width: 64,
        height: 64
      })
    );
  });

  it('requeues retryable failures with exponential backoff', async () => {
    getObjectBytesMock.mockRejectedValue(new Error('request timeout'));

    const { handler } = await import('../handlers/generateThumbnail.js');
    await handler(baseEvent(baseJob));

    expect(enqueueThumbnailJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 2
      }),
      expect.objectContaining({
        delaySeconds: 30
      })
    );
    expect(enqueueThumbnailFailureToDlqMock).not.toHaveBeenCalled();
  });

  it('moves to dlq after max attempts and persists FAILED state', async () => {
    process.env.THUMBNAIL_MAX_ATTEMPTS = '2';
    getObjectBytesMock.mockRejectedValue(new Error('request timeout'));

    const { handler } = await import('../handlers/generateThumbnail.js');
    await handler(
      baseEvent({
        ...baseJob,
        attempt: 2
      })
    );

    expect(enqueueThumbnailJobMock).not.toHaveBeenCalled();
    expect(upsertThumbnailMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        attempts: 2
      })
    );
    expect(enqueueThumbnailFailureToDlqMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'MAX_ATTEMPTS_EXCEEDED'
      })
    );
  });

  it('skips generation when matching READY metadata already exists', async () => {
    getThumbnailMetadataMock.mockResolvedValue({
      status: 'READY',
      sourceEtag: 'etag-1'
    });

    const { handler } = await import('../handlers/generateThumbnail.js');
    await handler(baseEvent(baseJob));

    expect(getObjectBytesMock).not.toHaveBeenCalled();
    expect(putObjectBytesMock).not.toHaveBeenCalled();
    expect(upsertThumbnailMetadataMock).not.toHaveBeenCalled();
  });
});
