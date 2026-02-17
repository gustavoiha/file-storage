import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const {
  requireEntitledUserMock,
  getDockspaceByIdMock,
  resolveFileByFullPathMock,
  upsertActiveFileByPathMock,
  findActiveMediaFileByContentHashMock,
  buildObjectKeyMock,
  parseObjectKeyMock,
  objectExistsMock,
  computeObjectSha256HexMock,
  deleteObjectIfExistsMock
} = vi.hoisted(() => ({
  requireEntitledUserMock: vi.fn(),
  getDockspaceByIdMock: vi.fn(),
  resolveFileByFullPathMock: vi.fn(),
  upsertActiveFileByPathMock: vi.fn(),
  findActiveMediaFileByContentHashMock: vi.fn(),
  buildObjectKeyMock: vi.fn(),
  parseObjectKeyMock: vi.fn(),
  objectExistsMock: vi.fn(),
  computeObjectSha256HexMock: vi.fn(),
  deleteObjectIfExistsMock: vi.fn()
}));

vi.mock('../lib/auth.js', () => ({
  requireEntitledUser: requireEntitledUserMock
}));

vi.mock('../lib/repository.js', () => ({
  getDockspaceById: getDockspaceByIdMock,
  resolveFileByFullPath: resolveFileByFullPathMock,
  upsertActiveFileByPath: upsertActiveFileByPathMock,
  findActiveMediaFileByContentHash: findActiveMediaFileByContentHashMock
}));

vi.mock('../lib/s3.js', () => ({
  buildObjectKey: buildObjectKeyMock,
  parseObjectKey: parseObjectKeyMock,
  objectExists: objectExistsMock,
  computeObjectSha256Hex: computeObjectSha256HexMock,
  deleteObjectIfExists: deleteObjectIfExistsMock
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
  resolveFileByFullPathMock.mockReset();
  upsertActiveFileByPathMock.mockReset();
  findActiveMediaFileByContentHashMock.mockReset();
  buildObjectKeyMock.mockReset();
  parseObjectKeyMock.mockReset();
  objectExistsMock.mockReset();
  computeObjectSha256HexMock.mockReset();
  deleteObjectIfExistsMock.mockReset();

  requireEntitledUserMock.mockReturnValue({ userId: 'user-1' });
  getDockspaceByIdMock.mockResolvedValue({ dockspaceId: 'dock-1', dockspaceType: 'PHOTOS_VIDEOS' });
  resolveFileByFullPathMock.mockResolvedValue(null);
  parseObjectKeyMock.mockReturnValue({ fileNodeId: 'new-file' });
  objectExistsMock.mockResolvedValue(true);
  computeObjectSha256HexMock.mockResolvedValue('abc123');
  findActiveMediaFileByContentHashMock.mockResolvedValue(null);
  upsertActiveFileByPathMock.mockResolvedValue({ fileNodeId: 'new-file', fullPath: '/photo.jpg' });

  vi.resetModules();
});

describe('confirm upload duplicate policy', () => {
  it('returns duplicate skip for PHOTOS_VIDEOS when hash already exists', async () => {
    findActiveMediaFileByContentHashMock.mockResolvedValue({ SK: 'L#existing' });

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
  });

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
  });
});
