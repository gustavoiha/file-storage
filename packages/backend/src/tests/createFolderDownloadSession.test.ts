import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const {
  requireEntitledUserMock,
  getDockspaceByIdMock,
  resolveFolderByPathMock,
  buildRecursiveFolderTrashPlanMock,
  getObjectReadStreamMock,
  createFileReadUrlMock,
  createZipStreamMock,
  uploadDoneMock,
  uploadConstructorMock
} = vi.hoisted(() => ({
  requireEntitledUserMock: vi.fn(),
  getDockspaceByIdMock: vi.fn(),
  resolveFolderByPathMock: vi.fn(),
  buildRecursiveFolderTrashPlanMock: vi.fn(),
  getObjectReadStreamMock: vi.fn(),
  createFileReadUrlMock: vi.fn(),
  createZipStreamMock: vi.fn(),
  uploadDoneMock: vi.fn(),
  uploadConstructorMock: vi.fn()
}));

vi.mock('../lib/auth.js', () => ({
  requireEntitledUser: requireEntitledUserMock
}));

vi.mock('../lib/repository.js', () => ({
  getDockspaceById: getDockspaceByIdMock,
  resolveFolderByPath: resolveFolderByPathMock,
  buildRecursiveFolderTrashPlan: buildRecursiveFolderTrashPlanMock
}));

vi.mock('../lib/s3.js', () => ({
  getObjectReadStream: getObjectReadStreamMock
}));

vi.mock('../lib/cdn.js', () => ({
  createFileReadUrl: createFileReadUrlMock
}));

vi.mock('../lib/zipStream.js', () => ({
  createZipStream: createZipStreamMock
}));

vi.mock('../lib/clients.js', () => ({
  s3Client: {}
}));

vi.mock('../lib/env.js', () => ({
  env: { tableName: 'table', bucketName: 'bucket', trashRetentionDays: 30 }
}));

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: class {
    constructor(params: unknown) {
      uploadConstructorMock(params);
    }
    done() {
      return uploadDoneMock();
    }
  }
}));

const resolvedFolder = {
  folderPath: '/docs',
  parentFolderPath: '/',
  folderNode: { name: 'docs' },
  directory: { childId: 'folder-1', childType: 'folder' as const, name: 'docs' }
};

const makeFile = (name: string, s3Key: string, size: number) => ({
  fullPath: `/docs/${name}`,
  folderPath: '/docs',
  fileNode: { s3Key, name, size, contentType: 'text/plain' },
  directory: { childId: s3Key, childType: 'file' as const, name }
});

const baseEvent = (body?: Record<string, unknown>): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'POST /dockspaces/{dockspaceId}/folders/download-session',
    rawPath: '/dockspaces/dock-1/folders/download-session',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'POST',
        path: '/dockspaces/dock-1/folders/download-session',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'request-id',
      routeKey: 'POST /dockspaces/{dockspaceId}/folders/download-session',
      stage: '$default',
      time: '',
      timeEpoch: 0
    },
    pathParameters: { dockspaceId: 'dock-1' },
    body: JSON.stringify(body ?? { folderPath: '/docs' }),
    isBase64Encoded: false
  }) as APIGatewayProxyEventV2;

beforeEach(() => {
  requireEntitledUserMock.mockReset();
  getDockspaceByIdMock.mockReset();
  resolveFolderByPathMock.mockReset();
  buildRecursiveFolderTrashPlanMock.mockReset();
  getObjectReadStreamMock.mockReset();
  createFileReadUrlMock.mockReset();
  createZipStreamMock.mockReset();
  uploadConstructorMock.mockReset();
  uploadDoneMock.mockReset();

  requireEntitledUserMock.mockReturnValue({ userId: 'user-1' });
  getDockspaceByIdMock.mockResolvedValue({ dockspaceId: 'dock-1' });
  resolveFolderByPathMock.mockResolvedValue(resolvedFolder);
  buildRecursiveFolderTrashPlanMock.mockResolvedValue({
    files: [makeFile('a.txt', 'dock-1/file-a', 100), makeFile('b.txt', 'dock-1/file-b', 200)],
    folderDirectories: [],
    folderNodeIds: ['folder-1']
  });
  getObjectReadStreamMock.mockResolvedValue(Readable.from(['data']));
  createZipStreamMock.mockReturnValue(Readable.from(['zip-data']));
  uploadDoneMock.mockResolvedValue(undefined);
  createFileReadUrlMock.mockResolvedValue({
    url: 'https://cdn.example/download.zip?Expires=123',
    expiresInSeconds: 900
  });

  vi.resetModules();
});

describe('createFolderDownloadSession handler', () => {
  it('returns signed url for folder download', async () => {
    const { handler } = await import('../handlers/createFolderDownloadSession.js');
    const response = await handler(baseEvent());
    const body = JSON.parse(response.body) as Record<string, unknown>;

    expect(response.statusCode).toBe(200);
    expect(body.folderName).toBe('docs');
    expect(body.fileCount).toBe(2);
    expect(body.totalSize).toBe(300);
    expect(body.downloadUrl).toBe('https://cdn.example/download.zip?Expires=123');
    expect(body.expiresInSeconds).toBe(900);
  });

  it('passes entries with relative paths and no compression for small folders', async () => {
    const { handler } = await import('../handlers/createFolderDownloadSession.js');
    await handler(baseEvent());

    expect(createZipStreamMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({ name: 'a.txt' }),
        expect.objectContaining({ name: 'b.txt' })
      ],
      { compress: false, level: 6 }
    );
  });

  it('enables compression when total size exceeds 50 MB', async () => {
    const largeFile = makeFile('big.bin', 'dock-1/file-big', 60 * 1024 * 1024);
    buildRecursiveFolderTrashPlanMock.mockResolvedValue({
      files: [largeFile],
      folderDirectories: [],
      folderNodeIds: ['folder-1']
    });

    const { handler } = await import('../handlers/createFolderDownloadSession.js');
    await handler(baseEvent());

    expect(createZipStreamMock).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'big.bin' })],
      { compress: true, level: 6 }
    );
  });

  it('strips folder prefix from nested file paths', async () => {
    buildRecursiveFolderTrashPlanMock.mockResolvedValue({
      files: [
        {
          fullPath: '/docs/sub/nested.txt',
          folderPath: '/docs/sub',
          fileNode: { s3Key: 'dock-1/file-n', name: 'nested.txt', size: 50, contentType: 'text/plain' },
          directory: { childId: 'dock-1/file-n', childType: 'file', name: 'nested.txt' }
        }
      ],
      folderDirectories: [],
      folderNodeIds: ['folder-1']
    });

    const { handler } = await import('../handlers/createFolderDownloadSession.js');
    await handler(baseEvent());

    expect(createZipStreamMock).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'sub/nested.txt' })],
      expect.any(Object)
    );
  });

  it('uploads zip to S3 with correct params', async () => {
    const { handler } = await import('../handlers/createFolderDownloadSession.js');
    await handler(baseEvent());

    expect(uploadConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          Bucket: 'bucket',
          ContentType: 'application/zip'
        })
      })
    );
    expect(uploadDoneMock).toHaveBeenCalled();
  });

  it('creates signed url with attachment disposition', async () => {
    const { handler } = await import('../handlers/createFolderDownloadSession.js');
    await handler(baseEvent());

    expect(createFileReadUrlMock).toHaveBeenCalledWith(
      expect.stringContaining('_downloads/dock-1/'),
      expect.objectContaining({
        asAttachment: true,
        fileName: 'docs.zip',
        expiresInSeconds: 900
      })
    );
  });

  it('returns 400 when folderPath is missing', async () => {
    const { handler } = await import('../handlers/createFolderDownloadSession.js');
    const response = await handler(baseEvent({}));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({ error: 'folderPath is required' });
  });

  it('returns 404 when dockspace not found', async () => {
    getDockspaceByIdMock.mockResolvedValue(null);

    const { handler } = await import('../handlers/createFolderDownloadSession.js');
    const response = await handler(baseEvent());

    expect(response.statusCode).toBe(404);
    expect(resolveFolderByPathMock).not.toHaveBeenCalled();
  });

  it('returns 404 when folder not found', async () => {
    resolveFolderByPathMock.mockResolvedValue(null);

    const { handler } = await import('../handlers/createFolderDownloadSession.js');
    const response = await handler(baseEvent());

    expect(response.statusCode).toBe(404);
    expect(buildRecursiveFolderTrashPlanMock).not.toHaveBeenCalled();
  });

  it('returns empty response when folder has no files', async () => {
    buildRecursiveFolderTrashPlanMock.mockResolvedValue({
      files: [],
      folderDirectories: [],
      folderNodeIds: ['folder-1']
    });

    const { handler } = await import('../handlers/createFolderDownloadSession.js');
    const response = await handler(baseEvent());
    const body = JSON.parse(response.body) as Record<string, unknown>;

    expect(response.statusCode).toBe(200);
    expect(body.fileCount).toBe(0);
    expect(body.downloadUrl).toBeNull();
    expect(createZipStreamMock).not.toHaveBeenCalled();
  });

  it('returns 400 when file count exceeds maximum', async () => {
    const files = Array.from({ length: 501 }, (_, i) =>
      makeFile(`file-${i}.txt`, `dock-1/file-${i}`, 10)
    );
    buildRecursiveFolderTrashPlanMock.mockResolvedValue({
      files,
      folderDirectories: [],
      folderNodeIds: ['folder-1']
    });

    const { handler } = await import('../handlers/createFolderDownloadSession.js');
    const response = await handler(baseEvent());

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('501 files');
  });

  it('returns 400 when total size exceeds limit', async () => {
    const bigFile = makeFile('huge.bin', 'dock-1/huge', 2.5 * 1024 * 1024 * 1024);
    buildRecursiveFolderTrashPlanMock.mockResolvedValue({
      files: [bigFile],
      folderDirectories: [],
      folderNodeIds: ['folder-1']
    });

    const { handler } = await import('../handlers/createFolderDownloadSession.js');
    const response = await handler(baseEvent());

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain('2 GB limit');
  });
});
