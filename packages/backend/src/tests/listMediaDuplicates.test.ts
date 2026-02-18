import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const {
  requireEntitledUserMock,
  ensureMediaDockspaceMock,
  listMediaDuplicateGroupsMock
} = vi.hoisted(() => ({
  requireEntitledUserMock: vi.fn(),
  ensureMediaDockspaceMock: vi.fn(),
  listMediaDuplicateGroupsMock: vi.fn()
}));

vi.mock('../lib/auth.js', () => ({
  requireEntitledUser: requireEntitledUserMock
}));

vi.mock('../lib/dockspaceTypeGuards.js', () => ({
  ensureMediaDockspace: ensureMediaDockspaceMock
}));

vi.mock('../lib/repository.js', () => ({
  listMediaDuplicateGroups: listMediaDuplicateGroupsMock
}));

const baseEvent = (queryStringParameters?: Record<string, string>): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'GET /dockspaces/{dockspaceId}/media/duplicates',
    rawPath: '/dockspaces/dock-1/media/duplicates',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'GET',
        path: '/dockspaces/dock-1/media/duplicates',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'request-id',
      routeKey: 'GET /dockspaces/{dockspaceId}/media/duplicates',
      stage: '$default',
      time: '',
      timeEpoch: 0
    },
    pathParameters: {
      dockspaceId: 'dock-1'
    },
    queryStringParameters,
    isBase64Encoded: false
  }) as APIGatewayProxyEventV2;

beforeEach(() => {
  requireEntitledUserMock.mockReset();
  ensureMediaDockspaceMock.mockReset();
  listMediaDuplicateGroupsMock.mockReset();

  requireEntitledUserMock.mockReturnValue({ userId: 'user-1' });
  ensureMediaDockspaceMock.mockResolvedValue({ ok: true });
  listMediaDuplicateGroupsMock.mockResolvedValue({
    items: [],
    summary: {
      groupCount: 0,
      duplicateItemCount: 0,
      reclaimableBytes: 0
    }
  });

  vi.resetModules();
});

describe('listMediaDuplicates handler', () => {
  it('returns duplicate groups with cursor and limit', async () => {
    const { handler } = await import('../handlers/listMediaDuplicates.js');
    const response = await handler(
      baseEvent({
        cursor: 'abc123',
        limit: '15'
      })
    );

    expect(response.statusCode).toBe(200);
    expect(listMediaDuplicateGroupsMock).toHaveBeenCalledWith({
      userId: 'user-1',
      dockspaceId: 'dock-1',
      cursor: 'abc123',
      limit: 15
    });
  });

  it('falls back to default pagination values for invalid query params', async () => {
    const { handler } = await import('../handlers/listMediaDuplicates.js');
    const response = await handler(
      baseEvent({
        cursor: '   ',
        limit: '-4'
      })
    );

    expect(response.statusCode).toBe(200);
    expect(listMediaDuplicateGroupsMock).toHaveBeenCalledWith({
      userId: 'user-1',
      dockspaceId: 'dock-1',
      limit: 20
    });
  });

  it('returns type-guard error when dockspace is not media', async () => {
    ensureMediaDockspaceMock.mockResolvedValue({
      ok: false,
      statusCode: 403,
      error: 'Forbidden'
    });

    const { handler } = await import('../handlers/listMediaDuplicates.js');
    const response = await handler(baseEvent());
    const body = JSON.parse(response.body ?? '{}') as { error?: string };

    expect(response.statusCode).toBe(403);
    expect(body.error).toBe('Forbidden');
    expect(listMediaDuplicateGroupsMock).not.toHaveBeenCalled();
  });
});
