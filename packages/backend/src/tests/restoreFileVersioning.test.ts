import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const {
  requireEntitledUserMock,
  findTrashedFilesByFullPathMock,
  findFileNodeByIdMock,
  fullPathForTrashedFileNodeMock,
  markFileNodePurgedMock,
  restoreFileNodeFromTrashMock,
  objectExistsMock,
  objectHasAnyVersionMock,
  clearTrashTagMock,
  ensureFolderNodeIdByPathMock,
  findDirectoryFileByNameMock
} = vi.hoisted(() => ({
  requireEntitledUserMock: vi.fn(),
  findTrashedFilesByFullPathMock: vi.fn(),
  findFileNodeByIdMock: vi.fn(),
  fullPathForTrashedFileNodeMock: vi.fn(),
  markFileNodePurgedMock: vi.fn(),
  restoreFileNodeFromTrashMock: vi.fn(),
  objectExistsMock: vi.fn(),
  objectHasAnyVersionMock: vi.fn(),
  clearTrashTagMock: vi.fn(),
  ensureFolderNodeIdByPathMock: vi.fn(),
  findDirectoryFileByNameMock: vi.fn()
}));

vi.mock('../lib/auth.js', () => ({
  requireEntitledUser: requireEntitledUserMock
}));

vi.mock('../lib/repository.js', () => ({
  findTrashedFilesByFullPath: findTrashedFilesByFullPathMock,
  findFileNodeById: findFileNodeByIdMock,
  fullPathForTrashedFileNode: fullPathForTrashedFileNodeMock,
  markFileNodePurged: markFileNodePurgedMock,
  restoreFileNodeFromTrash: restoreFileNodeFromTrashMock,
  ensureFolderNodeIdByPath: ensureFolderNodeIdByPathMock,
  findDirectoryFileByName: findDirectoryFileByNameMock
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
  findTrashedFilesByFullPathMock.mockReset();
  findFileNodeByIdMock.mockReset();
  fullPathForTrashedFileNodeMock.mockReset();
  fullPathForTrashedFileNodeMock.mockImplementation(
    async (_userId: string, _dockspaceId: string, fileNode: { trashedPath?: string }) =>
      fileNode.trashedPath ?? '/'
  );
  markFileNodePurgedMock.mockReset();
  restoreFileNodeFromTrashMock.mockReset();
  objectExistsMock.mockReset();
  objectHasAnyVersionMock.mockReset();
  clearTrashTagMock.mockReset();
  ensureFolderNodeIdByPathMock.mockReset();
  findDirectoryFileByNameMock.mockReset();
  requireEntitledUserMock.mockReturnValue({ userId: 'user-1' });
  findTrashedFilesByFullPathMock.mockResolvedValue([
    {
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
    }
  ]);
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

describe('restoreFile with two trashed files at the same path', () => {
  const trashedCopy = (fileNodeId: string, deletedAt: string) => ({
    PK: 'U#user-1#S#dock-1',
    SK: `L#${fileNodeId}`,
    type: 'FILE_NODE' as const,
    parentFolderNodeId: 'folder-1',
    s3Key: `dock-1/${fileNodeId}`,
    name: 'report.txt',
    size: 12,
    contentType: 'text/plain',
    etag: 'etag',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: deletedAt,
    deletedAt,
    flaggedForDeleteAt: '2026-03-30T00:00:00.000Z',
    trashedPath: '/docs/report.txt'
  });
  const olderCopy = trashedCopy('file-old', '2026-01-10T00:00:00.000Z');
  const newerCopy = trashedCopy('file-new', '2026-02-10T00:00:00.000Z');
  const eventWithBody = (body: Record<string, unknown>): APIGatewayProxyEventV2 => ({
    ...baseEvent(),
    body: JSON.stringify(body)
  });

  beforeEach(() => {
    findTrashedFilesByFullPathMock.mockResolvedValue([olderCopy, newerCopy]);
    findFileNodeByIdMock.mockImplementation(
      async (_userId: string, _dockspaceId: string, fileNodeId: string) =>
        [olderCopy, newerCopy].find((copy) => copy.SK === `L#${fileNodeId}`) ?? null
    );
    objectExistsMock.mockResolvedValue(true);
    ensureFolderNodeIdByPathMock.mockResolvedValue('folder-1');
    findDirectoryFileByNameMock.mockResolvedValue(null);
    restoreFileNodeFromTrashMock.mockResolvedValue(undefined);
    clearTrashTagMock.mockResolvedValue(undefined);
  });

  it.each([
    ['file-new', 'dock-1/file-new'],
    ['file-old', 'dock-1/file-old']
  ])('restores only the copy named by fileNodeId %s', async (fileNodeId, s3Key) => {
    const { handler } = await import('../handlers/restoreFile.js');
    const response = await handler(eventWithBody({ fullPath: '/docs/report.txt', fileNodeId }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '{}')).toEqual({
      fullPath: '/docs/report.txt',
      fileNodeId,
      state: 'ACTIVE'
    });
    expect(findTrashedFilesByFullPathMock).not.toHaveBeenCalled();
    expect(restoreFileNodeFromTrashMock).toHaveBeenCalledTimes(1);
    expect(restoreFileNodeFromTrashMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileNode: expect.objectContaining({ SK: `L#${fileNodeId}` }),
        parentFolderNodeId: 'folder-1',
        fileName: 'report.txt'
      })
    );
    expect(clearTrashTagMock).toHaveBeenCalledTimes(1);
    expect(clearTrashTagMock).toHaveBeenCalledWith(s3Key);
    expect(markFileNodePurgedMock).not.toHaveBeenCalled();
  });

  it('refuses to restore the second copy once the first is back in the folder', async () => {
    findDirectoryFileByNameMock.mockResolvedValue({ childId: 'file-new' });

    const { handler } = await import('../handlers/restoreFile.js');
    const response = await handler(
      eventWithBody({ fullPath: '/docs/report.txt', fileNodeId: 'file-old' })
    );

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body ?? '{}')).toEqual({
      error: 'Cannot restore because a file with this name already exists in the folder'
    });
    expect(restoreFileNodeFromTrashMock).not.toHaveBeenCalled();
    expect(clearTrashTagMock).not.toHaveBeenCalled();
  });

  it('rejects a path-only request as ambiguous and restores neither copy', async () => {
    const { handler } = await import('../handlers/restoreFile.js');
    const response = await handler(eventWithBody({ fullPath: '/docs/report.txt' }));

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body ?? '{}')).toEqual({
      error: 'More than one trashed file has this path; include fileNodeId to choose one',
      state: 'TRASH'
    });
    expect(objectExistsMock).not.toHaveBeenCalled();
    expect(restoreFileNodeFromTrashMock).not.toHaveBeenCalled();
    expect(clearTrashTagMock).not.toHaveBeenCalled();
  });

  it('returns not found when fileNodeId is trashed at a different path', async () => {
    const { handler } = await import('../handlers/restoreFile.js');
    const response = await handler(
      eventWithBody({ fullPath: '/docs/other.txt', fileNodeId: 'file-old' })
    );

    expect(response.statusCode).toBe(404);
    expect(restoreFileNodeFromTrashMock).not.toHaveBeenCalled();
  });

  it('returns not found when the named copy is no longer in the trash', async () => {
    const { deletedAt: _deletedAt, ...activeCopy } = newerCopy;
    findFileNodeByIdMock.mockResolvedValue(activeCopy);

    const { handler } = await import('../handlers/restoreFile.js');
    const response = await handler(
      eventWithBody({ fullPath: '/docs/report.txt', fileNodeId: 'file-new' })
    );

    expect(response.statusCode).toBe(404);
    expect(restoreFileNodeFromTrashMock).not.toHaveBeenCalled();
  });
});
