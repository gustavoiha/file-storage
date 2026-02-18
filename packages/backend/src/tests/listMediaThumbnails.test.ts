import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const {
  requireEntitledUserMock,
  ensureMediaDockspaceMock,
  listActiveMediaItemsMock,
  listThumbnailMetadataMock,
  createDownloadUrlMock
} = vi.hoisted(() => ({
  requireEntitledUserMock: vi.fn(),
  ensureMediaDockspaceMock: vi.fn(),
  listActiveMediaItemsMock: vi.fn(),
  listThumbnailMetadataMock: vi.fn(),
  createDownloadUrlMock: vi.fn()
}));

vi.mock('../lib/auth.js', () => ({
  requireEntitledUser: requireEntitledUserMock
}));

vi.mock('../lib/dockspaceTypeGuards.js', () => ({
  ensureMediaDockspace: ensureMediaDockspaceMock
}));

vi.mock('../lib/repository.js', () => ({
  listActiveMediaItems: listActiveMediaItemsMock,
  listThumbnailMetadata: listThumbnailMetadataMock
}));

vi.mock('../lib/s3.js', () => ({
  createDownloadUrl: createDownloadUrlMock
}));

const baseEvent = (): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'GET /dockspaces/{dockspaceId}/media',
    rawPath: '/dockspaces/dock-1/media',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'GET',
        path: '/dockspaces/dock-1/media',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'request-id',
      routeKey: 'GET /dockspaces/{dockspaceId}/media',
      stage: '$default',
      time: '',
      timeEpoch: 0
    },
    pathParameters: {
      dockspaceId: 'dock-1'
    },
    isBase64Encoded: false
  }) as APIGatewayProxyEventV2;

beforeEach(() => {
  requireEntitledUserMock.mockReset();
  ensureMediaDockspaceMock.mockReset();
  listActiveMediaItemsMock.mockReset();
  listThumbnailMetadataMock.mockReset();
  createDownloadUrlMock.mockReset();

  requireEntitledUserMock.mockReturnValue({ userId: 'user-1' });
  ensureMediaDockspaceMock.mockResolvedValue({ ok: true });
  listActiveMediaItemsMock.mockResolvedValue({
    items: [
      {
        fileNodeId: 'file-1',
        fullPath: '/photo.jpg',
        size: 10,
        contentType: 'image/jpeg',
        contentHash: 'hash-1',
        updatedAt: '2026-02-18T00:00:00.000Z',
        state: 'ACTIVE'
      }
    ]
  });
  listThumbnailMetadataMock.mockResolvedValue([
    {
      fileNodeId: 'file-1',
      status: 'READY',
      thumbnailKey: 'dock-1/thumbnails/file-1/v-etag.jpg',
      thumbnailContentType: 'image/jpeg',
      width: 320,
      height: 200
    }
  ]);
  createDownloadUrlMock.mockResolvedValue('https://cdn.example/thumb.jpg');

  vi.resetModules();
});

describe('listMedia thumbnails', () => {
  it('includes signed thumbnail urls when thumbnail metadata exists', async () => {
    const { handler } = await import('../handlers/listMedia.js');
    const response = await handler(baseEvent());
    const body = JSON.parse(response.body ?? '{}') as {
      items: Array<{ thumbnail?: { url: string; width?: number; height?: number } }>;
    };

    expect(response.statusCode).toBe(200);
    expect(listActiveMediaItemsMock).toHaveBeenCalledWith({
      userId: 'user-1',
      dockspaceId: 'dock-1',
      limit: 60
    });
    expect(createDownloadUrlMock).toHaveBeenCalledWith('dock-1/thumbnails/file-1/v-etag.jpg');
    expect(body.items[0]?.thumbnail?.url).toBe('https://cdn.example/thumb.jpg');
    expect(body.items[0]?.thumbnail?.width).toBe(320);
    expect(body.items[0]?.thumbnail?.height).toBe(200);
  });

  it('omits thumbnail when metadata is not ready', async () => {
    listThumbnailMetadataMock.mockResolvedValue([
      {
        fileNodeId: 'file-1',
        status: 'UNSUPPORTED'
      }
    ]);

    const { handler } = await import('../handlers/listMedia.js');
    const response = await handler(baseEvent());
    const body = JSON.parse(response.body ?? '{}') as {
      items: Array<{ thumbnail?: unknown }>;
    };

    expect(response.statusCode).toBe(200);
    expect(createDownloadUrlMock).not.toHaveBeenCalled();
    expect(body.items[0]?.thumbnail).toBeUndefined();
  });

  it('forwards cursor and limit query parameters', async () => {
    const { handler } = await import('../handlers/listMedia.js');
    await handler({
      ...baseEvent(),
      queryStringParameters: {
        cursor: '2026-02-18T00:00:00.000Z|file-1',
        limit: '25'
      }
    } as APIGatewayProxyEventV2);

    expect(listActiveMediaItemsMock).toHaveBeenCalledWith({
      userId: 'user-1',
      dockspaceId: 'dock-1',
      cursor: '2026-02-18T00:00:00.000Z|file-1',
      limit: 25
    });
  });
});
