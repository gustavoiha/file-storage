import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const { requireEntitledUserMock, moveFolderByPathMock } = vi.hoisted(() => ({
  requireEntitledUserMock: vi.fn(),
  moveFolderByPathMock: vi.fn()
}));

vi.mock('../lib/auth.js', () => ({
  requireEntitledUser: requireEntitledUserMock
}));

vi.mock('../lib/repository.js', () => ({
  moveFolderByPath: moveFolderByPathMock
}));

const baseEvent = (body?: Record<string, unknown>): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'POST /dockspaces/{dockspaceId}/folders/move',
    rawPath: '/dockspaces/dock-1/folders/move',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'POST',
        path: '/dockspaces/dock-1/folders/move',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'request-id',
      routeKey: 'POST /dockspaces/{dockspaceId}/folders/move',
      stage: '$default',
      time: '',
      timeEpoch: 0
    },
    pathParameters: {
      dockspaceId: 'dock-1'
    },
    isBase64Encoded: false,
    ...(body ? { body: JSON.stringify(body) } : {})
  }) as APIGatewayProxyEventV2;

beforeEach(() => {
  process.env.TABLE_NAME = 'table';
  process.env.BUCKET_NAME = 'bucket';
  requireEntitledUserMock.mockReset();
  moveFolderByPathMock.mockReset();
  requireEntitledUserMock.mockReturnValue({ userId: 'user-1' });
  vi.resetModules();
});

describe('moveFolder handler', () => {
  it('moves folder successfully', async () => {
    moveFolderByPathMock.mockResolvedValue({
      status: 'MOVED',
      from: '/docs',
      to: '/archive/docs'
    });

    const { handler } = await import('../handlers/moveFolder.js');
    const response = await handler(
      baseEvent({
        sourceFolderPath: '/docs',
        targetFolderPath: '/archive'
      })
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"status":"MOVED"');
    expect(response.body).toContain('"moved":true');
    expect(moveFolderByPathMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        dockspaceId: 'dock-1',
        sourceFolderPath: '/docs',
        targetFolderPath: '/archive'
      })
    );
  });

  it('returns 404 when source or destination is missing', async () => {
    moveFolderByPathMock.mockResolvedValue({ status: 'NOT_FOUND' });

    const { handler } = await import('../handlers/moveFolder.js');
    const response = await handler(
      baseEvent({
        sourceFolderPath: '/docs',
        targetFolderPath: '/archive'
      })
    );

    expect(response.statusCode).toBe(404);
  });

  it('returns 409 when destination has conflicting folder', async () => {
    moveFolderByPathMock.mockResolvedValue({ status: 'CONFLICT' });

    const { handler } = await import('../handlers/moveFolder.js');
    const response = await handler(
      baseEvent({
        sourceFolderPath: '/docs',
        targetFolderPath: '/archive'
      })
    );

    expect(response.statusCode).toBe(409);
  });

  it('returns 400 when destination is invalid', async () => {
    moveFolderByPathMock.mockResolvedValue({ status: 'INVALID_DESTINATION' });

    const { handler } = await import('../handlers/moveFolder.js');
    const response = await handler(
      baseEvent({
        sourceFolderPath: '/docs',
        targetFolderPath: '/docs/sub'
      })
    );

    expect(response.statusCode).toBe(400);
  });

  it('rejects moving root folder', async () => {
    const { handler } = await import('../handlers/moveFolder.js');
    const response = await handler(
      baseEvent({
        sourceFolderPath: '/',
        targetFolderPath: '/archive'
      })
    );

    expect(response.statusCode).toBe(400);
    expect(moveFolderByPathMock).not.toHaveBeenCalled();
  });
});
