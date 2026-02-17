import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const { requireEntitledUserMock, putDockspaceWithRootFolderMock } = vi.hoisted(() => ({
  requireEntitledUserMock: vi.fn(),
  putDockspaceWithRootFolderMock: vi.fn(async () => {})
}));

vi.mock('node:crypto', () => ({
  randomUUID: () => 'dockspace-123'
}));

vi.mock('../lib/auth.js', () => ({
  requireEntitledUser: requireEntitledUserMock
}));

vi.mock('../lib/repository.js', () => ({
  putDockspaceWithRootFolder: putDockspaceWithRootFolderMock
}));

const baseEvent = (body: Record<string, unknown>): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'POST /dockspaces',
    rawPath: '/dockspaces',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'POST',
        path: '/dockspaces',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'request-id',
      routeKey: 'POST /dockspaces',
      stage: '$default',
      time: '',
      timeEpoch: 0
    },
    isBase64Encoded: false,
    body: JSON.stringify(body)
  }) as APIGatewayProxyEventV2;

beforeEach(() => {
  process.env.TABLE_NAME = 'table';
  process.env.BUCKET_NAME = 'bucket';
  requireEntitledUserMock.mockReset();
  putDockspaceWithRootFolderMock.mockReset();
  requireEntitledUserMock.mockReturnValue({ userId: 'user-1' });
  vi.resetModules();
});

describe('createDockspace handler dockspaceType', () => {
  it('defaults to GENERIC_FILES when dockspaceType is omitted', async () => {
    const { handler } = await import('../handlers/createDockspace.js');
    const response = await handler(baseEvent({ name: 'Docs' }));

    expect(response.statusCode).toBe(201);
    expect(response.body).toContain('"dockspaceType":"GENERIC_FILES"');
    expect(putDockspaceWithRootFolderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dockspaceId: 'dockspace-123',
        dockspaceType: 'GENERIC_FILES'
      }),
      expect.any(String)
    );
  });

  it('persists PHOTOS_VIDEOS when explicitly selected', async () => {
    const { handler } = await import('../handlers/createDockspace.js');
    const response = await handler(baseEvent({ name: 'Camera Roll', dockspaceType: 'PHOTOS_VIDEOS' }));

    expect(response.statusCode).toBe(201);
    expect(response.body).toContain('"dockspaceType":"PHOTOS_VIDEOS"');
    expect(putDockspaceWithRootFolderMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dockspaceId: 'dockspace-123',
        dockspaceType: 'PHOTOS_VIDEOS'
      }),
      expect.any(String)
    );
  });
});
