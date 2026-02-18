import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const {
  requireEntitledUserMock,
  getDockspaceByIdMock,
  hasActiveMediaWithContentHashMock,
  resolveFileByFullPathMock,
  buildObjectKeyMock,
  startMultipartUploadMock
} = vi.hoisted(() => ({
  requireEntitledUserMock: vi.fn(),
  getDockspaceByIdMock: vi.fn(),
  hasActiveMediaWithContentHashMock: vi.fn(),
  resolveFileByFullPathMock: vi.fn(),
  buildObjectKeyMock: vi.fn(),
  startMultipartUploadMock: vi.fn()
}));

vi.mock('../lib/auth.js', () => ({
  requireEntitledUser: requireEntitledUserMock
}));

vi.mock('../lib/repository.js', () => ({
  getDockspaceById: getDockspaceByIdMock,
  hasActiveMediaWithContentHash: hasActiveMediaWithContentHashMock,
  resolveFileByFullPath: resolveFileByFullPathMock
}));

vi.mock('../lib/s3.js', () => ({
  buildObjectKey: buildObjectKeyMock,
  startMultipartUpload: startMultipartUploadMock
}));

const baseEvent = (body: Record<string, unknown>): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'POST /dockspaces/{dockspaceId}/files/multipart/start',
    rawPath: '/dockspaces/dock-1/files/multipart/start',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'POST',
        path: '/dockspaces/dock-1/files/multipart/start',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'request-id',
      routeKey: 'POST /dockspaces/{dockspaceId}/files/multipart/start',
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
  buildObjectKeyMock.mockReset();
  startMultipartUploadMock.mockReset();
  requireEntitledUserMock.mockReturnValue({ userId: 'user-1' });
  hasActiveMediaWithContentHashMock.mockResolvedValue(false);
  resolveFileByFullPathMock.mockResolvedValue(null);
  buildObjectKeyMock.mockReturnValue('user-1/dockspaces/dock-1/files/file-1');
  startMultipartUploadMock.mockResolvedValue('upload-id');
  vi.resetModules();
});

describe('startMultipartUpload duplicate policy', () => {
  it('requires contentHash for PHOTOS_VIDEOS', async () => {
    getDockspaceByIdMock.mockResolvedValue({
      dockspaceId: 'dock-1',
      dockspaceType: 'PHOTOS_VIDEOS'
    });

    const { handler } = await import('../handlers/startMultipartUpload.js');
    const response = await handler(
      baseEvent({
        fullPath: '/video.mp4',
        contentType: 'video/mp4',
        size: 8 * 1024 * 1024
      })
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('contentHash is required');
    expect(startMultipartUploadMock).not.toHaveBeenCalled();
  });

  it('returns duplicate skip for PHOTOS_VIDEOS by content hash', async () => {
    getDockspaceByIdMock.mockResolvedValue({
      dockspaceId: 'dock-1',
      dockspaceType: 'PHOTOS_VIDEOS'
    });
    hasActiveMediaWithContentHashMock.mockResolvedValue(true);

    const { handler } = await import('../handlers/startMultipartUpload.js');
    const response = await handler(
      baseEvent({
        fullPath: '/video.mp4',
        contentType: 'video/mp4',
        size: 8 * 1024 * 1024,
        contentHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      })
    );

    expect(response.statusCode).toBe(409);
    expect(response.body).toContain('UPLOAD_SKIPPED_DUPLICATE');
    expect(response.body).toContain('CONTENT_HASH');
    expect(startMultipartUploadMock).not.toHaveBeenCalled();
  });

  it('still allows GENERIC_FILES without content hash', async () => {
    getDockspaceByIdMock.mockResolvedValue({
      dockspaceId: 'dock-1',
      dockspaceType: 'GENERIC_FILES'
    });

    const { handler } = await import('../handlers/startMultipartUpload.js');
    const response = await handler(
      baseEvent({
        fullPath: '/big.bin',
        contentType: 'application/octet-stream',
        size: 32 * 1024 * 1024
      })
    );

    expect(response.statusCode).toBe(200);
    expect(startMultipartUploadMock).toHaveBeenCalled();
  });
});
