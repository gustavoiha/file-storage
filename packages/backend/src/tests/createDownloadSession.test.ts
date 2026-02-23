import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const {
  requireEntitledUserMock,
  getDockspaceByIdMock,
  findDownloadableFileByNodeIdMock,
  objectExistsMock,
  createFileReadUrlMock
} = vi.hoisted(() => ({
  requireEntitledUserMock: vi.fn(),
  getDockspaceByIdMock: vi.fn(),
  findDownloadableFileByNodeIdMock: vi.fn(),
  objectExistsMock: vi.fn(),
  createFileReadUrlMock: vi.fn()
}));

vi.mock('../lib/auth.js', () => ({
  requireEntitledUser: requireEntitledUserMock
}));

vi.mock('../lib/repository.js', () => ({
  getDockspaceById: getDockspaceByIdMock,
  findDownloadableFileByNodeId: findDownloadableFileByNodeIdMock
}));

vi.mock('../lib/s3.js', () => ({
  objectExists: objectExistsMock
}));

vi.mock('../lib/cdn.js', () => ({
  createFileReadUrl: createFileReadUrlMock
}));

const baseEvent = (): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'GET /dockspaces/{dockspaceId}/files/{fileNodeId}/download-session',
    rawPath: '/dockspaces/dock-1/files/file-1/download-session',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'GET',
        path: '/dockspaces/dock-1/files/file-1/download-session',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'request-id',
      routeKey: 'GET /dockspaces/{dockspaceId}/files/{fileNodeId}/download-session',
      stage: '$default',
      time: '',
      timeEpoch: 0
    },
    pathParameters: {
      dockspaceId: 'dock-1',
      fileNodeId: 'file-1'
    },
    isBase64Encoded: false
  }) as APIGatewayProxyEventV2;

beforeEach(() => {
  requireEntitledUserMock.mockReset();
  getDockspaceByIdMock.mockReset();
  findDownloadableFileByNodeIdMock.mockReset();
  objectExistsMock.mockReset();
  createFileReadUrlMock.mockReset();

  requireEntitledUserMock.mockReturnValue({ userId: 'user-1' });
  getDockspaceByIdMock.mockResolvedValue({ dockspaceId: 'dock-1' });
  findDownloadableFileByNodeIdMock.mockResolvedValue({
    s3Key: 'dock-1/file-1',
    name: 'notes.txt',
    contentType: 'text/plain',
    size: 123
  });
  objectExistsMock.mockResolvedValue(true);
  createFileReadUrlMock.mockResolvedValue({
    url: 'https://cdn.example/dock-1/file-1?Expires=123',
    expiresInSeconds: 900
  });

  vi.resetModules();
});

describe('createDownloadSession handler', () => {
  it('returns cloudfront signed url for authorized reads', async () => {
    const { handler } = await import('../handlers/createDownloadSession.js');
    const response = await handler(baseEvent());
    const body = JSON.parse(response.body ?? '{}') as {
      downloadUrl: string;
      expiresInSeconds: number;
    };

    expect(response.statusCode).toBe(200);
    expect(getDockspaceByIdMock).toHaveBeenCalledWith('user-1', 'dock-1');
    expect(findDownloadableFileByNodeIdMock).toHaveBeenCalledWith('user-1', 'dock-1', 'file-1');
    expect(objectExistsMock).toHaveBeenCalledWith('dock-1/file-1');
    expect(createFileReadUrlMock).toHaveBeenCalledWith('dock-1/file-1', {
      asAttachment: false,
      fileName: 'notes.txt',
      expiresInSeconds: 900
    });
    expect(body.downloadUrl).toContain('https://cdn.example/dock-1/file-1');
    expect(body.expiresInSeconds).toBe(900);
  });

  it('passes attachment disposition into signed url options', async () => {
    const { handler } = await import('../handlers/createDownloadSession.js');
    await handler({
      ...baseEvent(),
      queryStringParameters: {
        disposition: 'attachment'
      }
    } as APIGatewayProxyEventV2);

    expect(createFileReadUrlMock).toHaveBeenCalledWith('dock-1/file-1', {
      asAttachment: true,
      fileName: 'notes.txt',
      expiresInSeconds: 900
    });
  });

  it('returns 404 when dockspace does not belong to user', async () => {
    getDockspaceByIdMock.mockResolvedValueOnce(null);

    const { handler } = await import('../handlers/createDownloadSession.js');
    const response = await handler(baseEvent());

    expect(response.statusCode).toBe(404);
    expect(findDownloadableFileByNodeIdMock).not.toHaveBeenCalled();
  });
});
