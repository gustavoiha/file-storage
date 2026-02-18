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
    routeKey: 'POST /dockspaces/{dockspaceId}/files/confirm-upload',
    rawPath: '/dockspaces/dock-1/files/confirm-upload',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'POST',
        path: '/dockspaces/dock-1/files/confirm-upload',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'request-id',
      routeKey: 'POST /dockspaces/{dockspaceId}/files/confirm-upload',
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
  objectExistsMock.mockResolvedValue(true);
  computeObjectSha256HexMock.mockResolvedValue('abc123');
  upsertActiveFileByPathMock.mockResolvedValue({ fileNodeId: 'new-file', fullPath: '/photo.jpg' });
  buildThumbnailJobMock.mockImplementation((payload) => ({ ...payload, version: 1 }));
  enqueueThumbnailJobIfConfiguredMock.mockResolvedValue(true);

  vi.resetModules();
});

describe('confirm upload duplicate policy', () => {
  it('computes hash and persists it when upload is accepted', async () => {
    const { handler } = await import('../handlers/confirmUpload.js');
    const response = await handler(
      baseEvent({
        fullPath: '/photo.jpg',
        objectKey: 'dock-1/new-file',
        size: 10,
        etag: 'etag-1',
        contentType: 'image/jpeg'
      })
    );

    expect(response.statusCode).toBe(201);
    expect(computeObjectSha256HexMock).toHaveBeenCalledWith('dock-1/new-file');
    expect(upsertActiveFileByPathMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contentHash: 'abc123'
      })
    );
    expect(enqueueThumbnailJobIfConfiguredMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileNodeId: 'new-file',
        s3Key: 'dock-1/new-file',
        contentType: 'image/jpeg',
        etag: 'etag-1'
      })
    );
  });

  it('returns content-hash duplicate skip without metadata writes', async () => {
    hasActiveMediaWithContentHashMock.mockResolvedValue(true);

    const { handler } = await import('../handlers/confirmUpload.js');
    const response = await handler(
      baseEvent({
        fullPath: '/photo.jpg',
        objectKey: 'dock-1/new-file',
        size: 10,
        etag: 'etag-1',
        contentType: 'image/jpeg'
      })
    );

    expect(response.statusCode).toBe(409);
    expect(response.body).toContain('UPLOAD_SKIPPED_DUPLICATE');
    expect(response.body).toContain('CONTENT_HASH');
    expect(deleteObjectIfExistsMock).toHaveBeenCalledWith('dock-1/new-file');
    expect(upsertActiveFileByPathMock).not.toHaveBeenCalled();
    expect(enqueueThumbnailJobIfConfiguredMock).not.toHaveBeenCalled();
  });
});
