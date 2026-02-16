import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const { requireEntitledUserMock, listDockspacesMock, listDockspaceMetricsMock } = vi.hoisted(() => ({
  requireEntitledUserMock: vi.fn(),
  listDockspacesMock: vi.fn(),
  listDockspaceMetricsMock: vi.fn()
}));

vi.mock('../lib/auth.js', () => ({
  requireEntitledUser: requireEntitledUserMock
}));

vi.mock('../lib/repository.js', () => ({
  listDockspaces: listDockspacesMock,
  listDockspaceMetrics: listDockspaceMetricsMock
}));

const baseEvent = (): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'GET /dockspaces',
    rawPath: '/dockspaces',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'GET',
        path: '/dockspaces',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'request-id',
      routeKey: 'GET /dockspaces',
      stage: '$default',
      time: '',
      timeEpoch: 0
    },
    isBase64Encoded: false
  }) as APIGatewayProxyEventV2;

beforeEach(() => {
  process.env.TABLE_NAME = 'table';
  process.env.BUCKET_NAME = 'bucket';
  requireEntitledUserMock.mockReset();
  listDockspacesMock.mockReset();
  listDockspaceMetricsMock.mockReset();
  requireEntitledUserMock.mockReturnValue({ userId: 'user-1' });
  vi.resetModules();
});

describe('listDockspaces metrics merge', () => {
  it('merges dockspace metrics records and defaults missing metrics to zero', async () => {
    listDockspacesMock.mockResolvedValue([
      {
        PK: 'U#user-1',
        SK: 'S#dock-1',
        type: 'DOCKSPACE',
        userId: 'user-1',
        dockspaceId: 'dock-1',
        name: 'Main',
        createdAt: '2026-01-01T00:00:00.000Z'
      },
      {
        PK: 'U#user-1',
        SK: 'S#dock-2',
        type: 'DOCKSPACE',
        userId: 'user-1',
        dockspaceId: 'dock-2',
        name: 'Docs',
        createdAt: '2026-01-02T00:00:00.000Z'
      }
    ]);

    listDockspaceMetricsMock.mockResolvedValue([
      {
        PK: 'U#user-1',
        SK: 'M#S#dock-1',
        type: 'DOCKSPACE_METRICS',
        dockspaceId: 'dock-1',
        totalFileCount: 5,
        totalSizeBytes: 4096,
        lastUploadAt: '2026-01-10T00:00:00.000Z',
        updatedAt: '2026-01-10T00:00:00.000Z'
      }
    ]);

    const { handler } = await import('../handlers/listDockspaces.js');
    const response = await handler(baseEvent());

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(
      JSON.stringify({
        items: [
          {
            dockspaceId: 'dock-1',
            name: 'Main',
            createdAt: '2026-01-01T00:00:00.000Z',
            totalFileCount: 5,
            totalSizeBytes: 4096,
            lastUploadAt: '2026-01-10T00:00:00.000Z'
          },
          {
            dockspaceId: 'dock-2',
            name: 'Docs',
            createdAt: '2026-01-02T00:00:00.000Z',
            totalFileCount: 0,
            totalSizeBytes: 0
          }
        ]
      })
    );
  });
});
