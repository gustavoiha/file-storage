import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { buildDirectorySk, buildFileNodeSk, buildFilePk } from '../domain/keys.js';

const { sendMock, requireEntitledUserMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  requireEntitledUserMock: vi.fn()
}));

vi.mock('../lib/clients.js', () => ({
  dynamoDoc: { send: sendMock }
}));

vi.mock('../lib/auth.js', () => ({
  requireEntitledUser: requireEntitledUserMock
}));

const USER_ID = 'user-1';
const DOCKSPACE_ID = 'dock-1';
const PARENT_ID = 'folder-1';
const PK = buildFilePk(USER_ID, DOCKSPACE_ID);
const NOW = '2026-11-20T10:00:00.000Z';

type Item = Record<string, unknown>;
let items: Item[];
let unprocessedOnce: Set<string>;

const directory = (childId: string, childType: 'file' | 'folder', name: string): Item => ({
  PK,
  SK: buildDirectorySk(PARENT_ID, childType === 'file' ? 'L' : 'F', name.toLowerCase(), childId),
  type: 'DIRECTORY',
  name,
  normalizedName: name.toLowerCase(),
  childId,
  childType,
  parentFolderNodeId: PARENT_ID,
  createdAt: NOW,
  updatedAt: NOW
});

const fileNode = (fileNodeId: string, extra: Item = {}): Item => ({
  PK,
  SK: buildFileNodeSk(fileNodeId),
  type: 'FILE_NODE',
  parentFolderNodeId: PARENT_ID,
  name: fileNodeId,
  ...extra
});

const fakeSend = async (command: { constructor: { name: string }; input: Item }) => {
  const input = command.input;
  if (command.constructor.name === 'QueryCommand') {
    const values = input.ExpressionAttributeValues as Item;
    return {
      Items: items.filter(
        (item) => item.PK === values[':pk'] && String(item.SK).startsWith(String(values[':skPrefix']))
      )
    };
  }

  if (command.constructor.name === 'BatchGetCommand') {
    const [tableName, request] = Object.entries(
      input.RequestItems as Record<string, { Keys: Item[] }>
    )[0]!;
    if (request.Keys.length > 100) {
      throw new Error('BatchGet called with more than 100 keys');
    }
    const responses: Item[] = [];
    const unprocessed: Item[] = [];
    for (const key of request.Keys) {
      if (unprocessedOnce.has(String(key.SK))) {
        unprocessedOnce.delete(String(key.SK));
        unprocessed.push(key);
        continue;
      }
      const match = items.find((item) => item.PK === key.PK && item.SK === key.SK);
      if (match) {
        responses.push({ SK: match.SK, ...(match.size !== undefined ? { size: match.size } : {}) });
      }
    }
    return {
      Responses: { [tableName]: responses },
      ...(unprocessed.length ? { UnprocessedKeys: { [tableName]: { Keys: unprocessed } } } : {})
    };
  }

  throw new Error(`unexpected command ${command.constructor.name}`);
};

const event = (): APIGatewayProxyEventV2 =>
  ({
    pathParameters: { dockspaceId: DOCKSPACE_ID, parentFolderNodeId: PARENT_ID }
  }) as unknown as APIGatewayProxyEventV2;

interface ResponseItem {
  childId: string;
  childType: string;
  size?: number;
}

const callHandler = async (): Promise<{ statusCode: number; items: ResponseItem[] }> => {
  const { handler } = await import('../handlers/listFolderChildren.js');
  const response = await handler(event());
  const body = JSON.parse(response.body ?? '{}') as { items: ResponseItem[] };
  return { statusCode: response.statusCode, items: body.items };
};

beforeEach(() => {
  process.env.TABLE_NAME = 'test-table';
  process.env.BUCKET_NAME = 'test-bucket';
  items = [];
  unprocessedOnce = new Set();
  sendMock.mockReset();
  sendMock.mockImplementation(fakeSend);
  requireEntitledUserMock.mockReset();
  requireEntitledUserMock.mockReturnValue({ userId: USER_ID });
  vi.resetModules();
});

describe('listFolderChildren handler', () => {
  it('returns the stored size in bytes for each file and none for folders', async () => {
    items = [
      directory('file-a', 'file', 'a.txt'),
      directory('file-b', 'file', 'b.jpg'),
      directory('folder-x', 'folder', 'x'),
      fileNode('file-a', { size: 3_040_870 }),
      fileNode('file-b', { size: 0 })
    ];

    const { statusCode, items: children } = await callHandler();

    expect(statusCode).toBe(200);
    const byId = new Map(children.map((child) => [child.childId, child]));
    expect(byId.get('file-a')?.size).toBe(3_040_870);
    expect(byId.get('file-b')?.size).toBe(0);
    expect(byId.get('folder-x')).toBeDefined();
    expect('size' in byId.get('folder-x')!).toBe(false);
  });

  it('omits size, without failing, for files with no stored size or no file node', async () => {
    items = [
      directory('file-legacy', 'file', 'legacy.bin'),
      directory('file-missing', 'file', 'missing.bin'),
      directory('file-ok', 'file', 'ok.bin'),
      fileNode('file-legacy'),
      fileNode('file-ok', { size: 12 })
    ];

    const { statusCode, items: children } = await callHandler();

    expect(statusCode).toBe(200);
    const byId = new Map(children.map((child) => [child.childId, child]));
    expect(children).toHaveLength(3);
    expect('size' in byId.get('file-legacy')!).toBe(false);
    expect('size' in byId.get('file-missing')!).toBe(false);
    expect(byId.get('file-ok')?.size).toBe(12);
  });

  it('does not read file nodes when the folder has no files', async () => {
    items = [directory('folder-x', 'folder', 'x')];

    const { statusCode } = await callHandler();

    expect(statusCode).toBe(200);
    expect(
      sendMock.mock.calls.some(([command]) => command.constructor.name === 'BatchGetCommand')
    ).toBe(false);
  });

  it('batches file node reads in chunks of 100 and retries unprocessed keys', async () => {
    for (let index = 0; index < 150; index += 1) {
      const id = `file-${String(index).padStart(3, '0')}`;
      items.push(directory(id, 'file', `${id}.txt`), fileNode(id, { size: index + 1 }));
    }
    unprocessedOnce.add(buildFileNodeSk('file-007'));
    unprocessedOnce.add(buildFileNodeSk('file-120'));

    const { statusCode, items: children } = await callHandler();

    expect(statusCode).toBe(200);
    expect(children).toHaveLength(150);
    expect(children.every((child) => child.size === Number(child.childId.slice(5)) + 1)).toBe(true);
    const batchGets = sendMock.mock.calls.filter(
      ([command]) => command.constructor.name === 'BatchGetCommand'
    );
    expect(batchGets).toHaveLength(4);
  });
});
