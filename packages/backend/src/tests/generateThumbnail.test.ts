import type { SQSEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findFileNodeByIdMock,
  getThumbnailMetadataMock,
  upsertThumbnailMetadataMock,
  buildThumbnailObjectKeyMock,
  getObjectBytesMock,
  putObjectBytesMock,
  objectExistsMock,
  buildThumbnailJobMock,
  enqueueThumbnailJobMock,
  enqueueThumbnailFailureToDlqMock,
  heicConvertMock,
  sharpMock,
  sharpToBufferMock
} = vi.hoisted(() => ({
  findFileNodeByIdMock: vi.fn(),
  getThumbnailMetadataMock: vi.fn(),
  upsertThumbnailMetadataMock: vi.fn(),
  buildThumbnailObjectKeyMock: vi.fn(),
  getObjectBytesMock: vi.fn(),
  putObjectBytesMock: vi.fn(),
  objectExistsMock: vi.fn(),
  buildThumbnailJobMock: vi.fn(),
  enqueueThumbnailJobMock: vi.fn(),
  enqueueThumbnailFailureToDlqMock: vi.fn(),
  heicConvertMock: vi.fn(),
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
  putObjectBytes: putObjectBytesMock,
  objectExists: objectExistsMock
}));

vi.mock('../lib/thumbnailQueue.js', () => ({
  buildThumbnailJob: buildThumbnailJobMock,
  enqueueThumbnailJob: enqueueThumbnailJobMock,
  enqueueThumbnailFailureToDlq: enqueueThumbnailFailureToDlqMock
}));

vi.mock('heic-convert', () => ({
  default: heicConvertMock
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
  objectExistsMock.mockReset();
  buildThumbnailJobMock.mockReset();
  enqueueThumbnailJobMock.mockReset();
  enqueueThumbnailFailureToDlqMock.mockReset();
  heicConvertMock.mockReset();
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
  objectExistsMock.mockResolvedValue(true);
  buildThumbnailJobMock.mockImplementation((payload) => ({
    ...payload,
    version: 1,
    jobType: 'GENERATE_THUMBNAIL'
  }));
  enqueueThumbnailJobMock.mockResolvedValue(undefined);
  enqueueThumbnailFailureToDlqMock.mockResolvedValue(undefined);
  heicConvertMock.mockResolvedValue(Buffer.from([7, 7, 7]));

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

  it('detects HEIC bytes for octet-stream uploads and generates thumbnail', async () => {
    getObjectBytesMock.mockResolvedValue(
      new Uint8Array(Buffer.from('\x00\x00\x00\x18ftypheic\x00\x00\x00\x00', 'latin1'))
    );

    const { handler } = await import('../handlers/generateThumbnail.js');
    await handler(
      baseEvent({
        ...baseJob,
        contentType: 'application/octet-stream'
      })
    );

    expect(putObjectBytesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'dock-1/thumbnails/file-1/v-etag-1.jpg',
        contentType: 'image/jpeg'
      })
    );
    expect(upsertThumbnailMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'READY',
        sourceContentType: 'application/octet-stream'
      })
    );
  });

  it('marks octet-stream payload as unsupported when bytes are not HEIC', async () => {
    getObjectBytesMock.mockResolvedValue(new Uint8Array([1, 2, 3, 4]));

    const { handler } = await import('../handlers/generateThumbnail.js');
    await handler(
      baseEvent({
        ...baseJob,
        contentType: 'application/octet-stream'
      })
    );

    expect(putObjectBytesMock).not.toHaveBeenCalled();
    expect(upsertThumbnailMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'UNSUPPORTED',
        sourceContentType: 'application/octet-stream'
      })
    );
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
      sourceEtag: 'etag-1',
      thumbnailKey: 'dock-1/thumbnails/file-1/v-etag-1.jpg'
    });

    const { handler } = await import('../handlers/generateThumbnail.js');
    await handler(baseEvent(baseJob));

    expect(getObjectBytesMock).not.toHaveBeenCalled();
    expect(putObjectBytesMock).not.toHaveBeenCalled();
    expect(upsertThumbnailMetadataMock).not.toHaveBeenCalled();
  });

  it('regenerates when READY metadata exists but thumbnail object is missing', async () => {
    getThumbnailMetadataMock.mockResolvedValue({
      status: 'READY',
      sourceEtag: 'etag-1',
      thumbnailKey: 'dock-1/thumbnails/file-1/v-etag-1.jpg'
    });
    objectExistsMock.mockResolvedValue(false);

    const { handler } = await import('../handlers/generateThumbnail.js');
    await handler(baseEvent(baseJob));

    expect(getObjectBytesMock).toHaveBeenCalledWith('dock-1/file-1');
    expect(putObjectBytesMock).toHaveBeenCalledTimes(1);
    expect(upsertThumbnailMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'READY',
        thumbnailKey: 'dock-1/thumbnails/file-1/v-etag-1.jpg'
      })
    );
  });

  it('falls back to HEIC conversion when sharp cannot decode HEIC source', async () => {
    sharpToBufferMock.mockRejectedValueOnce(new Error('unsupported image format'));
    heicConvertMock.mockResolvedValueOnce(Buffer.from([1, 2, 3]));

    const { handler } = await import('../handlers/generateThumbnail.js');
    await handler(
      baseEvent({
        ...baseJob,
        contentType: 'image/heic'
      })
    );

    expect(heicConvertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'JPEG'
      })
    );
    expect(putObjectBytesMock).toHaveBeenCalledTimes(1);
    expect(upsertThumbnailMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'READY',
        sourceContentType: 'image/heic'
      })
    );
  });

  it('falls back to HEIC conversion when sharp reports missing HEIF compression plugin', async () => {
    sharpToBufferMock.mockRejectedValueOnce(
      new Error('heif: Error while loading plugin: Support for this compression format has not been built in')
    );
    heicConvertMock.mockResolvedValueOnce(Buffer.from([1, 2, 3]));

    const { handler } = await import('../handlers/generateThumbnail.js');
    await handler(
      baseEvent({
        ...baseJob,
        contentType: 'image/heic'
      })
    );

    expect(heicConvertMock).toHaveBeenCalledTimes(1);
    expect(putObjectBytesMock).toHaveBeenCalledTimes(1);
    expect(upsertThumbnailMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'READY',
        sourceContentType: 'image/heic'
      })
    );
  });

  it('retries previously unsupported HEIC for same etag after support is added', async () => {
    getThumbnailMetadataMock.mockResolvedValue({
      status: 'UNSUPPORTED',
      sourceEtag: 'etag-1'
    });
    sharpToBufferMock.mockRejectedValueOnce(new Error('unsupported image format'));
    heicConvertMock.mockResolvedValueOnce(Buffer.from([1, 2, 3]));

    const { handler } = await import('../handlers/generateThumbnail.js');
    await handler(
      baseEvent({
        ...baseJob,
        contentType: 'image/heic'
      })
    );

    expect(heicConvertMock).toHaveBeenCalledTimes(1);
    expect(putObjectBytesMock).toHaveBeenCalledTimes(1);
    expect(upsertThumbnailMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'READY',
        sourceContentType: 'image/heic'
      })
    );
  });
});
