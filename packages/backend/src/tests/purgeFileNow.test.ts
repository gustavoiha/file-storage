import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const {
  requireEntitledUserMock,
  findTrashedFilesByFullPathMock,
  findFileNodeByIdMock,
  fullPathForTrashedFileNodeMock,
  purgeObjectVersionsMock,
  purgeObjectVersionsByPrefixMock,
  buildThumbnailObjectPrefixMock,
  markFileNodePurgedMock
} = vi.hoisted(() => ({
  requireEntitledUserMock: vi.fn(),
  findTrashedFilesByFullPathMock: vi.fn(),
  findFileNodeByIdMock: vi.fn(),
  fullPathForTrashedFileNodeMock: vi.fn(),
  purgeObjectVersionsMock: vi.fn(),
  purgeObjectVersionsByPrefixMock: vi.fn(),
  buildThumbnailObjectPrefixMock: vi.fn(),
  markFileNodePurgedMock: vi.fn()
}));

vi.mock('../lib/auth.js', () => ({
  requireEntitledUser: requireEntitledUserMock
}));

vi.mock('../lib/repository.js', () => ({
  findTrashedFilesByFullPath: findTrashedFilesByFullPathMock,
  findFileNodeById: findFileNodeByIdMock,
  fullPathForTrashedFileNode: fullPathForTrashedFileNodeMock,
  markFileNodePurged: markFileNodePurgedMock
}));

vi.mock('../lib/s3.js', () => ({
  purgeObjectVersions: purgeObjectVersionsMock,
  purgeObjectVersionsByPrefix: purgeObjectVersionsByPrefixMock,
  buildThumbnailObjectPrefix: buildThumbnailObjectPrefixMock
}));

const baseEvent = (): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'POST /dockspaces/{dockspaceId}/files/purge',
    rawPath: '/dockspaces/dock-1/files/purge',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'POST',
        path: '/dockspaces/dock-1/files/purge',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'request-id',
      routeKey: 'POST /dockspaces/{dockspaceId}/files/purge',
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
  purgeObjectVersionsMock.mockReset();
  purgeObjectVersionsByPrefixMock.mockReset();
  buildThumbnailObjectPrefixMock.mockReset();
  markFileNodePurgedMock.mockReset();
  requireEntitledUserMock.mockReturnValue({ userId: 'user-1' });
  buildThumbnailObjectPrefixMock.mockImplementation(
    (dockspaceId: string, fileNodeId: string) => `${dockspaceId}/thumbnails/${fileNodeId}/`
  );
  vi.useRealTimers();
  vi.resetModules();
});

describe('purgeFileNow handler', () => {
  it('purges versions and marks trashed file as PURGED', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-16T18:00:00.000Z'));
    findTrashedFilesByFullPathMock.mockResolvedValue([
      {
        PK: 'U#user-1#S#dock-1',
        SK: 'L#file-1',
        type: 'FILE_NODE',
        parentFolderNodeId: 'root',
        s3Key: 'dock-1/file-1',
        name: 'report.txt',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-05T00:00:00.000Z',
        size: 12,
        contentType: 'text/plain',
        etag: 'etag',
        deletedAt: '2026-02-01T00:00:00.000Z',
        flaggedForDeleteAt: '2026-03-01T00:00:00.000Z',
        trashedPath: '/docs/report.txt'
      }
    ]);
    purgeObjectVersionsMock.mockResolvedValue({
      discoveredVersionCount: 2,
      deletedVersionCount: 2,
      remainingVersionCount: 0
    });
    purgeObjectVersionsByPrefixMock.mockResolvedValue({
      discoveredVersionCount: 1,
      deletedVersionCount: 1,
      remainingVersionCount: 0
    });
    markFileNodePurgedMock.mockResolvedValue(undefined);

    const { handler } = await import('../handlers/purgeFileNow.js');
    const response = await handler(baseEvent());

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(
      JSON.stringify({
        fullPath: '/docs/report.txt',
        fileNodeId: 'file-1',
        state: 'PURGED',
        purgedAt: '2026-02-16T18:00:00.000Z'
      })
    );
    expect(purgeObjectVersionsMock).toHaveBeenCalledWith('dock-1/file-1');
    expect(buildThumbnailObjectPrefixMock).toHaveBeenCalledWith('dock-1', 'file-1');
    expect(purgeObjectVersionsByPrefixMock).toHaveBeenCalledWith('dock-1/thumbnails/file-1/');
    expect(markFileNodePurgedMock).toHaveBeenCalledWith({
      userId: 'user-1',
      dockspaceId: 'dock-1',
      fileNode: expect.objectContaining({
        s3Key: 'dock-1/file-1'
      }),
      nowIso: '2026-02-16T18:00:00.000Z'
    });
  });

  it('returns not found when trashed file does not exist', async () => {
    findTrashedFilesByFullPathMock.mockResolvedValue([]);

    const { handler } = await import('../handlers/purgeFileNow.js');
    const response = await handler(baseEvent());

    expect(response.statusCode).toBe(404);
    expect(response.body).toBe(JSON.stringify({ error: 'Trashed file not found' }));
    expect(purgeObjectVersionsMock).not.toHaveBeenCalled();
    expect(purgeObjectVersionsByPrefixMock).not.toHaveBeenCalled();
    expect(markFileNodePurgedMock).not.toHaveBeenCalled();
  });

  it('returns conflict when versions remain after purge attempt', async () => {
    findTrashedFilesByFullPathMock.mockResolvedValue([
      {
        PK: 'U#user-1#S#dock-1',
        SK: 'L#file-1',
        type: 'FILE_NODE',
        parentFolderNodeId: 'root',
        s3Key: 'dock-1/file-1',
        name: 'report.txt',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-05T00:00:00.000Z',
        size: 12,
        contentType: 'text/plain',
        etag: 'etag',
        deletedAt: '2026-02-01T00:00:00.000Z',
        flaggedForDeleteAt: '2026-03-01T00:00:00.000Z',
        trashedPath: '/docs/report.txt'
      }
    ]);
    purgeObjectVersionsMock.mockResolvedValue({
      discoveredVersionCount: 3,
      deletedVersionCount: 2,
      remainingVersionCount: 1
    });

    const { handler } = await import('../handlers/purgeFileNow.js');
    const response = await handler(baseEvent());

    expect(response.statusCode).toBe(409);
    expect(response.body).toBe(
      JSON.stringify({
        error: 'Could not fully purge object versions from S3',
        state: 'TRASH'
      })
    );
    expect(markFileNodePurgedMock).not.toHaveBeenCalled();
  });

  it('returns conflict when thumbnail versions remain after purge attempt', async () => {
    findTrashedFilesByFullPathMock.mockResolvedValue([
      {
        PK: 'U#user-1#S#dock-1',
        SK: 'L#file-1',
        type: 'FILE_NODE',
        parentFolderNodeId: 'root',
        s3Key: 'dock-1/file-1',
        name: 'report.txt',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-05T00:00:00.000Z',
        size: 12,
        contentType: 'text/plain',
        etag: 'etag',
        deletedAt: '2026-02-01T00:00:00.000Z',
        flaggedForDeleteAt: '2026-03-01T00:00:00.000Z',
        trashedPath: '/docs/report.txt'
      }
    ]);
    purgeObjectVersionsMock.mockResolvedValue({
      discoveredVersionCount: 2,
      deletedVersionCount: 2,
      remainingVersionCount: 0
    });
    purgeObjectVersionsByPrefixMock.mockResolvedValue({
      discoveredVersionCount: 3,
      deletedVersionCount: 2,
      remainingVersionCount: 1
    });

    const { handler } = await import('../handlers/purgeFileNow.js');
    const response = await handler(baseEvent());

    expect(response.statusCode).toBe(409);
    expect(response.body).toBe(
      JSON.stringify({
        error: 'Could not fully purge thumbnail object versions from S3',
        state: 'TRASH'
      })
    );
    expect(markFileNodePurgedMock).not.toHaveBeenCalled();
  });
});

describe('purgeFileNow handler with two trashed files at the same path', () => {
  const trashedCopy = (fileNodeId: string, deletedAt: string) => ({
    PK: 'U#user-1#S#dock-1',
    SK: `L#${fileNodeId}`,
    type: 'FILE_NODE' as const,
    parentFolderNodeId: 'root',
    s3Key: `dock-1/${fileNodeId}`,
    name: 'report.txt',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: deletedAt,
    size: 12,
    contentType: 'text/plain',
    etag: 'etag',
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
    purgeObjectVersionsMock.mockResolvedValue({
      discoveredVersionCount: 1,
      deletedVersionCount: 1,
      remainingVersionCount: 0
    });
    purgeObjectVersionsByPrefixMock.mockResolvedValue({
      discoveredVersionCount: 0,
      deletedVersionCount: 0,
      remainingVersionCount: 0
    });
    markFileNodePurgedMock.mockResolvedValue(undefined);
  });

  it.each([
    ['file-new', 'dock-1/file-new'],
    ['file-old', 'dock-1/file-old']
  ])('purges only the copy named by fileNodeId %s', async (fileNodeId, s3Key) => {
    const { handler } = await import('../handlers/purgeFileNow.js');
    const response = await handler(eventWithBody({ fullPath: '/docs/report.txt', fileNodeId }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '{}')).toMatchObject({
      fullPath: '/docs/report.txt',
      fileNodeId,
      state: 'PURGED'
    });
    expect(findFileNodeByIdMock).toHaveBeenCalledWith('user-1', 'dock-1', fileNodeId);
    expect(findTrashedFilesByFullPathMock).not.toHaveBeenCalled();
    expect(purgeObjectVersionsMock).toHaveBeenCalledTimes(1);
    expect(purgeObjectVersionsMock).toHaveBeenCalledWith(s3Key);
    expect(purgeObjectVersionsByPrefixMock).toHaveBeenCalledWith(`dock-1/thumbnails/${fileNodeId}/`);
    expect(markFileNodePurgedMock).toHaveBeenCalledTimes(1);
    expect(markFileNodePurgedMock).toHaveBeenCalledWith(
      expect.objectContaining({ fileNode: expect.objectContaining({ SK: `L#${fileNodeId}` }) })
    );
  });

  it('rejects a path-only request as ambiguous and purges neither copy', async () => {
    const { handler } = await import('../handlers/purgeFileNow.js');
    const response = await handler(eventWithBody({ fullPath: '/docs/report.txt' }));

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body ?? '{}')).toEqual({
      error: 'More than one trashed file has this path; include fileNodeId to choose one',
      state: 'TRASH'
    });
    expect(purgeObjectVersionsMock).not.toHaveBeenCalled();
    expect(purgeObjectVersionsByPrefixMock).not.toHaveBeenCalled();
    expect(markFileNodePurgedMock).not.toHaveBeenCalled();
  });

  it('returns not found when the named copy was already purged, leaving the other copy alone', async () => {
    findFileNodeByIdMock.mockResolvedValue({
      ...newerCopy,
      purgedAt: '2026-02-11T00:00:00.000Z'
    });

    const { handler } = await import('../handlers/purgeFileNow.js');
    const response = await handler(
      eventWithBody({ fullPath: '/docs/report.txt', fileNodeId: 'file-new' })
    );

    expect(response.statusCode).toBe(404);
    expect(purgeObjectVersionsMock).not.toHaveBeenCalled();
    expect(markFileNodePurgedMock).not.toHaveBeenCalled();
  });

  it('returns not found when fileNodeId is trashed at a different path', async () => {
    const { handler } = await import('../handlers/purgeFileNow.js');
    const response = await handler(
      eventWithBody({ fullPath: '/docs/other.txt', fileNodeId: 'file-new' })
    );

    expect(response.statusCode).toBe(404);
    expect(purgeObjectVersionsMock).not.toHaveBeenCalled();
    expect(markFileNodePurgedMock).not.toHaveBeenCalled();
  });

  it('returns not found for an unknown fileNodeId', async () => {
    const { handler } = await import('../handlers/purgeFileNow.js');
    const response = await handler(
      eventWithBody({ fullPath: '/docs/report.txt', fileNodeId: 'missing' })
    );

    expect(response.statusCode).toBe(404);
    expect(purgeObjectVersionsMock).not.toHaveBeenCalled();
  });
});
