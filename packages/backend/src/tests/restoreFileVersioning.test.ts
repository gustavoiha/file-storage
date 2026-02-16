import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const {
  requireEntitledUserMock,
  findTrashedFileByFullPathMock,
  markFileNodePurgedMock,
  restoreFileNodeFromTrashMock,
  objectExistsMock,
  objectHasAnyVersionMock,
  clearTrashTagMock
} = vi.hoisted(() => ({
  requireEntitledUserMock: vi.fn(),
  findTrashedFileByFullPathMock: vi.fn(),
  markFileNodePurgedMock: vi.fn(),
  restoreFileNodeFromTrashMock: vi.fn(),
  objectExistsMock: vi.fn(),
  objectHasAnyVersionMock: vi.fn(),
  clearTrashTagMock: vi.fn()
}));

vi.mock('../lib/auth.js', () => ({
  requireEntitledUser: requireEntitledUserMock
}));

vi.mock('../lib/repository.js', () => ({
  findTrashedFileByFullPath: findTrashedFileByFullPathMock,
  markFileNodePurged: markFileNodePurgedMock,
  restoreFileNodeFromTrash: restoreFileNodeFromTrashMock,
  ensureFolderNodeIdByPath: vi.fn(),
  findDirectoryFileByName: vi.fn()
}));

vi.mock('../lib/s3.js', () => ({
  objectExists: objectExistsMock,
  objectHasAnyVersion: objectHasAnyVersionMock,
  clearTrashTag: clearTrashTagMock
}));

const baseEvent = (): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'POST /dockspaces/{dockspaceId}/files/restore',
    rawPath: '/dockspaces/dock-1/files/restore',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'POST',
        path: '/dockspaces/dock-1/files/restore',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'request-id',
      routeKey: 'POST /dockspaces/{dockspaceId}/files/restore',
      stage: '$default',
      time: '',
      timeEpoch: 0
    },
    pathParameters: {
      dockspaceId: 'dock-1'
    },
    isBase64Encoded: false,
    body: JSON.stringify({
      fullPath: '/docs/report.txt'
    })
  }) as APIGatewayProxyEventV2;

beforeEach(() => {
  process.env.TABLE_NAME = 'table';
  process.env.BUCKET_NAME = 'bucket';
  requireEntitledUserMock.mockReset();
  findTrashedFileByFullPathMock.mockReset();
  markFileNodePurgedMock.mockReset();
  restoreFileNodeFromTrashMock.mockReset();
  objectExistsMock.mockReset();
  objectHasAnyVersionMock.mockReset();
  clearTrashTagMock.mockReset();
  requireEntitledUserMock.mockReturnValue({ userId: 'user-1' });
  findTrashedFileByFullPathMock.mockResolvedValue({
    PK: 'U#user-1#S#dock-1',
    SK: 'L#file-1',
    type: 'FILE_NODE',
    parentFolderNodeId: 'folder-1',
    s3Key: 'dock-1/file-1',
    name: 'report.txt',
    size: 12,
    contentType: 'text/plain',
    etag: 'etag',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: '2026-01-02T00:00:00.000Z',
    flaggedForDeleteAt: '2026-02-01T00:00:00.000Z',
    trashedPath: '/docs/report.txt'
  });
  vi.useRealTimers();
  vi.resetModules();
});

describe('restoreFile version-aware semantics', () => {
  it('keeps file in TRASH when current version is missing but other versions still exist', async () => {
    objectExistsMock.mockResolvedValue(false);
    objectHasAnyVersionMock.mockResolvedValue(true);

    const { handler } = await import('../handlers/restoreFile.js');
    const response = await handler(baseEvent());

    expect(response.statusCode).toBe(409);
    expect(response.body).toBe(
      JSON.stringify({
        error: 'Object current version is unavailable and cannot be restored',
        state: 'TRASH'
      })
    );
    expect(markFileNodePurgedMock).not.toHaveBeenCalled();
    expect(restoreFileNodeFromTrashMock).not.toHaveBeenCalled();
    expect(clearTrashTagMock).not.toHaveBeenCalled();
  });

  it('marks file as PURGED when no object versions remain', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-16T15:00:00.000Z'));
    objectExistsMock.mockResolvedValue(false);
    objectHasAnyVersionMock.mockResolvedValue(false);

    const { handler } = await import('../handlers/restoreFile.js');
    const response = await handler(baseEvent());

    expect(response.statusCode).toBe(409);
    expect(response.body).toBe(
      JSON.stringify({
        error: 'Object already purged from S3',
        state: 'PURGED'
      })
    );
    expect(markFileNodePurgedMock).toHaveBeenCalledWith({
      userId: 'user-1',
      dockspaceId: 'dock-1',
      fileNode: expect.objectContaining({
        s3Key: 'dock-1/file-1'
      }),
      nowIso: '2026-02-16T15:00:00.000Z'
    });
    expect(restoreFileNodeFromTrashMock).not.toHaveBeenCalled();
    expect(clearTrashTagMock).not.toHaveBeenCalled();
  });
});
