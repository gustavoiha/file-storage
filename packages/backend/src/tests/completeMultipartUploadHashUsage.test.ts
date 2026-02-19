import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const {
  requireEntitledUserMock,
  getDockspaceByIdMock,
  hasActiveMediaWithContentHashMock,
  resolveFileByFullPathMock,
  upsertActiveFileByPathMock,
  buildObjectKeyMock,
  parseObjectKeyMock,
  completeMultipartUploadMock,
  objectExistsMock,
  computeObjectSha256HexMock,
  deleteObjectIfExistsMock,
  buildThumbnailJobMock,
  enqueueThumbnailJobIfConfiguredMock
} = vi.hoisted(() => ({
  requireEntitledUserMock: vi.fn(),
  getDockspaceByIdMock: vi.fn(),
  hasActiveMediaWithContentHashMock: vi.fn(),
  resolveFileByFullPathMock: vi.fn(),
  upsertActiveFileByPathMock: vi.fn(),
  buildObjectKeyMock: vi.fn(),
  parseObjectKeyMock: vi.fn(),
  completeMultipartUploadMock: vi.fn(),
  objectExistsMock: vi.fn(),
  computeObjectSha256HexMock: vi.fn(),
  deleteObjectIfExistsMock: vi.fn(),
  buildThumbnailJobMock: vi.fn(),
  enqueueThumbnailJobIfConfiguredMock: vi.fn()
}));

vi.mock('../lib/auth.js', () => ({
  requireEntitledUser: requireEntitledUserMock
}));

vi.mock('../lib/repository.js', () => ({
  getDockspaceById: getDockspaceByIdMock,
  hasActiveMediaWithContentHash: hasActiveMediaWithContentHashMock,
  resolveFileByFullPath: resolveFileByFullPathMock,
  upsertActiveFileByPath: upsertActiveFileByPathMock
}));

vi.mock('../lib/s3.js', () => ({
  buildObjectKey: buildObjectKeyMock,
  parseObjectKey: parseObjectKeyMock,
  completeMultipartUpload: completeMultipartUploadMock,
  objectExists: objectExistsMock,
  computeObjectSha256Hex: computeObjectSha256HexMock,
  deleteObjectIfExists: deleteObjectIfExistsMock
}));

vi.mock('../lib/thumbnailQueue.js', () => ({
  buildThumbnailJob: buildThumbnailJobMock,
  enqueueThumbnailJobIfConfigured: enqueueThumbnailJobIfConfiguredMock
}));

const baseEvent = (body: Record<string, unknown>): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'POST /dockspaces/{dockspaceId}/files/multipart/complete',
    rawPath: '/dockspaces/dock-1/files/multipart/complete',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'POST',
        path: '/dockspaces/dock-1/files/multipart/complete',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'request-id',
      routeKey: 'POST /dockspaces/{dockspaceId}/files/multipart/complete',
      stage: '$default',
      time: '',
      timeEpoch: 0
    },
    pathParameters: {
      dockspaceId: 'dock-1'
    },
    isBase64Encoded: false,
    body: JSON.stringify(body)
  }) as APIGatewayProxyEventV2;

beforeEach(() => {
  process.env.TABLE_NAME = 'table';
  process.env.BUCKET_NAME = 'bucket';

  requireEntitledUserMock.mockReset();
  getDockspaceByIdMock.mockReset();
  hasActiveMediaWithContentHashMock.mockReset();
  resolveFileByFullPathMock.mockReset();
  upsertActiveFileByPathMock.mockReset();
  buildObjectKeyMock.mockReset();
  parseObjectKeyMock.mockReset();
  completeMultipartUploadMock.mockReset();
  objectExistsMock.mockReset();
  computeObjectSha256HexMock.mockReset();
  deleteObjectIfExistsMock.mockReset();
  buildThumbnailJobMock.mockReset();
  enqueueThumbnailJobIfConfiguredMock.mockReset();

  requireEntitledUserMock.mockReturnValue({ userId: 'user-1' });
  getDockspaceByIdMock.mockResolvedValue({ dockspaceId: 'dock-1', dockspaceType: 'PHOTOS_VIDEOS' });
  hasActiveMediaWithContentHashMock.mockResolvedValue(false);
  resolveFileByFullPathMock.mockResolvedValue(null);
  parseObjectKeyMock.mockReturnValue({ fileNodeId: 'new-file' });
  completeMultipartUploadMock.mockResolvedValue('"etag-complete"');
  objectExistsMock.mockResolvedValue(true);
  computeObjectSha256HexMock.mockResolvedValue('abc123');
  upsertActiveFileByPathMock.mockResolvedValue({ fileNodeId: 'new-file', fullPath: '/video.mp4' });
  buildThumbnailJobMock.mockImplementation((payload) => ({ ...payload, version: 1 }));
  enqueueThumbnailJobIfConfiguredMock.mockResolvedValue(true);

  vi.resetModules();
});

describe('complete multipart upload hash usage', () => {
  it('uses provided contentHash without re-hashing object bytes', async () => {
    const { handler } = await import('../handlers/completeMultipartUpload.js');
    const response = await handler(
      baseEvent({
        fullPath: '/video.mp4',
        objectKey: 'dock-1/new-file',
        uploadId: 'upload-id',
        parts: [{ partNumber: 1, etag: '"etag-1"' }],
        size: 10,
        contentType: 'video/mp4',
        contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      })
    );

    expect(response.statusCode).toBe(201);
    expect(computeObjectSha256HexMock).not.toHaveBeenCalled();
    expect(upsertActiveFileByPathMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      })
    );
  });

  it('rejects invalid provided contentHash', async () => {
    const { handler } = await import('../handlers/completeMultipartUpload.js');
    const response = await handler(
      baseEvent({
        fullPath: '/video.mp4',
        objectKey: 'dock-1/new-file',
        uploadId: 'upload-id',
        parts: [{ partNumber: 1, etag: '"etag-1"' }],
        size: 10,
        contentType: 'video/mp4',
        contentHash: 'not-a-hash'
      })
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('contentHash must be a sha256 hex value');
    expect(computeObjectSha256HexMock).not.toHaveBeenCalled();
    expect(upsertActiveFileByPathMock).not.toHaveBeenCalled();
  });
});
