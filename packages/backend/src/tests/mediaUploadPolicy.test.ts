import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const {
  requireEntitledUserMock,
  getDockspaceByIdMock,
  hasActiveMediaWithContentHashMock,
  resolveFileByFullPathMock,
  buildObjectKeyMock,
  createUploadUrlMock
} = vi.hoisted(() => ({
  requireEntitledUserMock: vi.fn(),
  getDockspaceByIdMock: vi.fn(),
  hasActiveMediaWithContentHashMock: vi.fn(),
  resolveFileByFullPathMock: vi.fn(),
  buildObjectKeyMock: vi.fn(),
  createUploadUrlMock: vi.fn()
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
  createUploadUrl: createUploadUrlMock
}));

const baseEvent = (body: Record<string, unknown>): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'POST /dockspaces/{dockspaceId}/files/upload-session',
    rawPath: '/dockspaces/dock-1/files/upload-session',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'POST',
        path: '/dockspaces/dock-1/files/upload-session',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'request-id',
      routeKey: 'POST /dockspaces/{dockspaceId}/files/upload-session',
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
  createUploadUrlMock.mockReset();
  requireEntitledUserMock.mockReturnValue({ userId: 'user-1' });
  hasActiveMediaWithContentHashMock.mockResolvedValue(false);
  resolveFileByFullPathMock.mockResolvedValue(null);
  buildObjectKeyMock.mockReturnValue('user-1/dockspaces/dock-1/files/file-1');
  createUploadUrlMock.mockResolvedValue('https://upload.example');
  vi.resetModules();
});

describe('media upload policy', () => {
  it('rejects non-media MIME types for PHOTOS_VIDEOS dockspaces', async () => {
    getDockspaceByIdMock.mockResolvedValue({
      dockspaceId: 'dock-1',
      dockspaceType: 'PHOTOS_VIDEOS'
    });

    const { handler } = await import('../handlers/createUploadSession.js');
    const response = await handler(
      baseEvent({
        fullPath: '/notes.txt',
        contentType: 'text/plain'
      })
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('only accept image/* or video/* uploads');
    expect(createUploadUrlMock).not.toHaveBeenCalled();
  });

  it('rejects nested upload paths for PHOTOS_VIDEOS dockspaces', async () => {
    getDockspaceByIdMock.mockResolvedValue({
      dockspaceId: 'dock-1',
      dockspaceType: 'PHOTOS_VIDEOS'
    });

    const { handler } = await import('../handlers/createUploadSession.js');
    const response = await handler(
      baseEvent({
        fullPath: '/2026/trip/photo.jpg',
        contentType: 'image/jpeg'
      })
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('require uploads at the root path');
    expect(createUploadUrlMock).not.toHaveBeenCalled();
  });

  it('allows non-media uploads in GENERIC_FILES dockspaces', async () => {
    getDockspaceByIdMock.mockResolvedValue({
      dockspaceId: 'dock-1',
      dockspaceType: 'GENERIC_FILES'
    });

    const { handler } = await import('../handlers/createUploadSession.js');
    const response = await handler(
      baseEvent({
        fullPath: '/notes.txt',
        contentType: 'text/plain'
      })
    );

    expect(response.statusCode).toBe(200);
    expect(createUploadUrlMock).toHaveBeenCalledWith(
      'user-1/dockspaces/dock-1/files/file-1',
      'text/plain'
    );
  });

  it('requires contentHash for PHOTOS_VIDEOS dockspaces', async () => {
    getDockspaceByIdMock.mockResolvedValue({
      dockspaceId: 'dock-1',
      dockspaceType: 'PHOTOS_VIDEOS'
    });

    const { handler } = await import('../handlers/createUploadSession.js');
    const response = await handler(
      baseEvent({
        fullPath: '/photo.jpg',
        contentType: 'image/jpeg'
      })
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain('contentHash is required');
    expect(createUploadUrlMock).not.toHaveBeenCalled();
  });

  it('returns duplicate skip for PHOTOS_VIDEOS when same content hash already exists', async () => {
    getDockspaceByIdMock.mockResolvedValue({
      dockspaceId: 'dock-1',
      dockspaceType: 'PHOTOS_VIDEOS'
    });
    hasActiveMediaWithContentHashMock.mockResolvedValue(true);

    const { handler } = await import('../handlers/createUploadSession.js');
    const response = await handler(
      baseEvent({
        fullPath: '/photo.jpg',
        contentType: 'image/jpeg',
        contentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      })
    );

    expect(response.statusCode).toBe(409);
    expect(response.body).toContain('UPLOAD_SKIPPED_DUPLICATE');
    expect(response.body).toContain('CONTENT_HASH');
    expect(createUploadUrlMock).not.toHaveBeenCalled();
  });

  it('returns duplicate skip for GENERIC_FILES when same fullPath already exists', async () => {
    getDockspaceByIdMock.mockResolvedValue({
      dockspaceId: 'dock-1',
      dockspaceType: 'GENERIC_FILES'
    });
    resolveFileByFullPathMock.mockResolvedValue({
      fileNode: {
        SK: 'L#existing-file'
      }
    });

    const { handler } = await import('../handlers/createUploadSession.js');
    const response = await handler(
      baseEvent({
        fullPath: '/notes.txt',
        contentType: 'text/plain'
      })
    );

    expect(response.statusCode).toBe(409);
    expect(response.body).toContain('UPLOAD_SKIPPED_DUPLICATE');
    expect(createUploadUrlMock).not.toHaveBeenCalled();
  });

});
