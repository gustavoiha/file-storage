import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const {
  requireEntitledUserMock,
  listTrashedFileStateIndexMock,
  listPurgedFileStateIndexMock
} = vi.hoisted(() => ({
  requireEntitledUserMock: vi.fn(),
  listTrashedFileStateIndexMock: vi.fn(),
  listPurgedFileStateIndexMock: vi.fn()
}));

vi.mock('../lib/auth.js', () => ({
  requireEntitledUser: requireEntitledUserMock
}));

vi.mock('../lib/repository.js', () => ({
  listTrashedFileStateIndex: listTrashedFileStateIndexMock,
  listPurgedFileStateIndex: listPurgedFileStateIndexMock
}));

const baseEvent = (): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'GET /dockspaces/{dockspaceId}/trash',
    rawPath: '/dockspaces/dock-1/trash',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'GET',
        path: '/dockspaces/dock-1/trash',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'request-id',
      routeKey: 'GET /dockspaces/{dockspaceId}/trash',
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
  process.env.TABLE_NAME = 'table';
  process.env.BUCKET_NAME = 'bucket';
  requireEntitledUserMock.mockReset();
  listTrashedFileStateIndexMock.mockReset();
  listPurgedFileStateIndexMock.mockReset();
  requireEntitledUserMock.mockReturnValue({ userId: 'user-1' });
  vi.resetModules();
});

describe('state-index list handlers', () => {
  it('lists trash items from state index records', async () => {
    listTrashedFileStateIndexMock.mockResolvedValue([
      {
        PK: 'U#user-1#S#dock-1',
        SK: 'X#TRASH#2026-03-01T00:00:00.000Z#file-1',
        type: 'FILE_STATE_INDEX',
        state: 'TRASH',
        fileNodeId: 'file-1',
        trashedPath: '/docs/report.txt',
        size: 123,
        deletedAt: '2026-02-01T00:00:00.000Z',
        flaggedForDeleteAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z'
      },
      {
        PK: 'U#user-1#S#dock-1',
        SK: 'X#TRASH#2026-03-02T00:00:00.000Z#file-2',
        type: 'FILE_STATE_INDEX',
        state: 'TRASH',
        fileNodeId: 'file-2',
        updatedAt: '2026-02-01T00:00:00.000Z'
      }
    ]);

    const { handler } = await import('../handlers/listTrash.js');
    const response = await handler(baseEvent());

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(
      JSON.stringify({
        items: [
          {
            fullPath: '/docs/report.txt',
            size: 123,
            deletedAt: '2026-02-01T00:00:00.000Z',
            flaggedForDeleteAt: '2026-03-01T00:00:00.000Z',
            state: 'TRASH'
          }
        ]
      })
    );
    expect(listTrashedFileStateIndexMock).toHaveBeenCalledWith('user-1', 'dock-1');
  });

  it('lists purged items from state index records', async () => {
    listPurgedFileStateIndexMock.mockResolvedValue([
      {
        PK: 'U#user-1#S#dock-1',
        SK: 'X#PURGED#2026-02-02T00:00:00.000Z#file-1',
        type: 'FILE_STATE_INDEX',
        state: 'PURGED',
        fileNodeId: 'file-1',
        trashedPath: '/docs/report.txt',
        purgedAt: '2026-02-02T00:00:00.000Z',
        updatedAt: '2026-02-02T00:00:00.000Z'
      }
    ]);

    const { handler } = await import('../handlers/listPurged.js');
    const response = await handler({
      ...baseEvent(),
      routeKey: 'GET /dockspaces/{dockspaceId}/purged',
      rawPath: '/dockspaces/dock-1/purged',
      requestContext: {
        ...baseEvent().requestContext,
        http: {
          ...baseEvent().requestContext.http,
          path: '/dockspaces/dock-1/purged'
        }
      }
    } as APIGatewayProxyEventV2);

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(
      JSON.stringify({
        items: [
          {
            fullPath: '/docs/report.txt',
            purgedAt: '2026-02-02T00:00:00.000Z',
            state: 'PURGED'
          }
        ]
      })
    );
    expect(listPurgedFileStateIndexMock).toHaveBeenCalledWith('user-1', 'dock-1');
  });
});
