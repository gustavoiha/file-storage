import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDirectorySk,
  buildFilePk,
  buildFolderNodeSk,
  ROOT_FOLDER_NODE_ID
} from '../domain/keys.js';
import { normalizeNodeName } from '../domain/path.js';
import type { DirectoryItem, FolderNodeItem } from '../types/models.js';
import { FakeDynamoTable, TransactionCanceledError } from './helpers/fakeDynamoTable.js';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn()
}));

vi.mock('../lib/clients.js', () => ({
  dynamoDoc: { send: sendMock }
}));

const USER_ID = 'user-1';
const DOCKSPACE_ID = 'dock-1';
const PK = buildFilePk(USER_ID, DOCKSPACE_ID);
const NOW = '2026-09-24T13:37:53.000Z';

let table: FakeDynamoTable;

beforeEach(() => {
  process.env.TABLE_NAME = 'test-table';
  process.env.BUCKET_NAME = 'test-bucket';
  table = new FakeDynamoTable();
  sendMock.mockReset();
  sendMock.mockImplementation((command: unknown) => table.send(command));
  vi.resetModules();
});

const rootNode = (extra: Partial<FolderNodeItem> = {}): FolderNodeItem => ({
  PK,
  SK: buildFolderNodeSk(ROOT_FOLDER_NODE_ID),
  type: 'FOLDER_NODE',
  name: '/',
  createdAt: NOW,
  updatedAt: NOW,
  ...extra
});

const folder = (parentFolderNodeId: string, name: string, id: string): [FolderNodeItem, DirectoryItem] => {
  const normalizedName = normalizeNodeName(name);
  return [
    {
      PK,
      SK: buildFolderNodeSk(id),
      type: 'FOLDER_NODE',
      parentFolderNodeId,
      name,
      createdAt: NOW,
      updatedAt: NOW
    },
    {
      PK,
      SK: buildDirectorySk(parentFolderNodeId, 'F', normalizedName, id),
      type: 'DIRECTORY',
      name,
      normalizedName,
      childId: id,
      childType: 'folder',
      parentFolderNodeId,
      createdAt: NOW,
      updatedAt: NOW
    }
  ];
};

const foldersNamed = (parentFolderNodeId: string, name: string): DirectoryItem[] =>
  table.itemsWhere<DirectoryItem>(
    (item) =>
      item.type === 'DIRECTORY' &&
      item.childType === 'folder' &&
      item.parentFolderNodeId === parentFolderNodeId &&
      item.normalizedName === normalizeNodeName(name)
  );

const folderNodeCount = (): number =>
  table.itemsWhere((item) => item.type === 'FOLDER_NODE' && item.SK !== buildFolderNodeSk(ROOT_FOLDER_NODE_ID)).length;

const isTransactWrite = (command: { constructor: { name: string } }): boolean =>
  command.constructor.name === 'TransactWriteCommand';

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Make every writer finish its reads before any writer commits: this is the interleaving
 * that produced duplicate folders in production (all four confirm-upload requests saw
 * "folder does not exist yet").
 */
const delayCommits = (ms = 5): void => {
  table.beforeCommand = async (command) => {
    if (isTransactWrite(command)) {
      await wait(ms);
    }
  };
};

const importRepository = async () => import('../lib/repository.js');

describe('concurrent folder creation', () => {
  it('two simultaneous creators of the same folder converge on one folder node', async () => {
    table.seed([rootNode()]);
    delayCommits();
    const { ensureFolderNodeIdByPath } = await importRepository();

    const [first, second] = await Promise.all([
      ensureFolderNodeIdByPath(USER_ID, DOCKSPACE_ID, '/test', NOW),
      ensureFolderNodeIdByPath(USER_ID, DOCKSPACE_ID, '/test', NOW)
    ]);

    expect(first).toBe(second);
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'test')).toHaveLength(1);
    expect(folderNodeCount()).toBe(1);
    expect(table.get<FolderNodeItem>(PK, buildFolderNodeSk(ROOT_FOLDER_NODE_ID))!.childrenVersion).toBe(1);
  });

  it('four parallel uploads into a new nested folder create each folder exactly once', async () => {
    table.seed([rootNode()]);
    delayCommits();
    const { upsertActiveFileByPath } = await importRepository();

    const names = ['one.pdf', 'two.pdf', 'three.pdf', 'four.pdf'];
    const results = await Promise.all(
      names.map((name, index) =>
        upsertActiveFileByPath({
          userId: USER_ID,
          dockspaceId: DOCKSPACE_ID,
          fullPath: `/test/test-b/test-c/${name}`,
          s3Key: `${DOCKSPACE_ID}/file-${index}`,
          preferredFileNodeId: `file-${index}`,
          size: 10,
          contentType: 'application/pdf',
          contentHash: 'a'.repeat(64),
          etag: `etag-${index}`,
          nowIso: NOW
        })
      )
    );

    expect(results.map((result) => result.fullPath).sort()).toEqual(
      names.map((name) => `/test/test-b/test-c/${name}`).sort()
    );

    const test = foldersNamed(ROOT_FOLDER_NODE_ID, 'test');
    expect(test).toHaveLength(1);
    const testB = foldersNamed(test[0]!.childId, 'test-b');
    expect(testB).toHaveLength(1);
    const testC = foldersNamed(testB[0]!.childId, 'test-c');
    expect(testC).toHaveLength(1);
    expect(folderNodeCount()).toBe(3);

    const files = table.itemsWhere<DirectoryItem>(
      (item) => item.type === 'DIRECTORY' && item.childType === 'file'
    );
    expect(files).toHaveLength(4);
    expect(new Set(files.map((entry) => entry.parentFolderNodeId))).toEqual(new Set([testC[0]!.childId]));

    const metrics = table.get(`U#${USER_ID}`, `M#S#${DOCKSPACE_ID}`);
    expect(metrics?.totalFileCount).toBe(4);
  });

  it('reuses a folder that was created before childrenVersion existed and starts its version', async () => {
    table.seed([rootNode(), ...folder(ROOT_FOLDER_NODE_ID, 'legacy', 'legacy-1')]);
    const { ensureFolderNodeIdByPath } = await importRepository();

    const parentId = await ensureFolderNodeIdByPath(USER_ID, DOCKSPACE_ID, '/legacy', NOW);
    expect(parentId).toBe('legacy-1');
    expect(table.writes).toEqual([]);

    await ensureFolderNodeIdByPath(USER_ID, DOCKSPACE_ID, '/legacy/child', NOW);

    expect(foldersNamed('legacy-1', 'child')).toHaveLength(1);
    expect(table.get<FolderNodeItem>(PK, buildFolderNodeSk('legacy-1'))!.childrenVersion).toBe(1);
    expect(table.get<FolderNodeItem>(PK, buildFolderNodeSk(ROOT_FOLDER_NODE_ID))!.childrenVersion).toBeUndefined();
  });

  it('bumps an existing childrenVersion when adding a sibling', async () => {
    table.seed([rootNode({ childrenVersion: 7 })]);
    const { ensureFolderNodeIdByPath } = await importRepository();

    await ensureFolderNodeIdByPath(USER_ID, DOCKSPACE_ID, '/new', NOW);

    expect(table.get<FolderNodeItem>(PK, buildFolderNodeSk(ROOT_FOLDER_NODE_ID))!.childrenVersion).toBe(8);
  });

  it('gives up with a clear error if the parent keeps changing', async () => {
    table.seed([rootNode()]);
    let version = 0;
    table.beforeCommand = (command) => {
      if (isTransactWrite(command)) {
        // Someone else always wins: bump the parent's version right before we commit.
        version += 1;
        table.seed([rootNode({ childrenVersion: version })]);
      }
    };
    const { ensureFolderNodeIdByPath } = await importRepository();

    await expect(ensureFolderNodeIdByPath(USER_ID, DOCKSPACE_ID, '/contended', NOW)).rejects.toThrow(
      /Could not create folder "contended"/
    );
    expect(folderNodeCount()).toBe(0);
  });
});

describe('transaction conflict retries on file upsert', () => {
  const upsert = async () => {
    const { upsertActiveFileByPath } = await importRepository();
    return upsertActiveFileByPath({
      userId: USER_ID,
      dockspaceId: DOCKSPACE_ID,
      fullPath: '/report.pdf',
      s3Key: `${DOCKSPACE_ID}/file-1`,
      preferredFileNodeId: 'file-1',
      size: 10,
      contentType: 'application/pdf',
      contentHash: 'a'.repeat(64),
      etag: 'etag-1',
      nowIso: NOW
    });
  };

  it('retries when the transaction was cancelled only by a conflict on a shared item', async () => {
    table.seed([rootNode()]);
    let conflictsLeft = 2;
    table.beforeCommand = (command) => {
      if (isTransactWrite(command) && conflictsLeft > 0) {
        conflictsLeft -= 1;
        throw new TransactionCanceledError([
          { Code: 'None' },
          { Code: 'None' },
          { Code: 'TransactionConflict', Message: 'Transaction is ongoing for the item' }
        ]);
      }
    };

    const result = await upsert();

    expect(result.fullPath).toBe('/report.pdf');
    expect(conflictsLeft).toBe(0);
    expect(table.get(PK, 'L#file-1')).toBeDefined();
    expect(table.commands.filter(isTransactWrite)).toHaveLength(3);
  });

  it('does not retry when a condition actually failed', async () => {
    table.seed([rootNode()]);
    table.beforeCommand = (command) => {
      if (isTransactWrite(command)) {
        throw new TransactionCanceledError([
          { Code: 'ConditionalCheckFailed', Message: 'The conditional request failed' },
          { Code: 'None' },
          { Code: 'None' }
        ]);
      }
    };

    await expect(upsert()).rejects.toThrow('Transaction cancelled');
    expect(table.commands.filter(isTransactWrite)).toHaveLength(1);
  });

  it('gives up after repeated conflicts', async () => {
    table.seed([rootNode()]);
    table.beforeCommand = (command) => {
      if (isTransactWrite(command)) {
        throw new TransactionCanceledError([{ Code: 'TransactionConflict' }]);
      }
    };

    await expect(upsert()).rejects.toThrow('Transaction cancelled');
    expect(table.commands.filter(isTransactWrite)).toHaveLength(5);
  });
});

describe('rename and move folders under concurrent sibling creation', () => {
  /** On the first commit attempt, a concurrent writer adds `name` under `parentId`. */
  const injectConcurrentSibling = (parentId: string, name: string, id: string): void => {
    let injected = false;
    table.beforeCommand = (command) => {
      if (isTransactWrite(command) && !injected) {
        injected = true;
        const parent = table.get<FolderNodeItem>(PK, buildFolderNodeSk(parentId))!;
        table.seed([
          { ...parent, childrenVersion: (parent.childrenVersion ?? 0) + 1 },
          ...folder(parentId, name, id)
        ]);
      }
    };
  };

  it('rename reports CONFLICT instead of creating a second folder with the new name', async () => {
    table.seed([rootNode(), ...folder(ROOT_FOLDER_NODE_ID, 'a', 'a-1')]);
    injectConcurrentSibling(ROOT_FOLDER_NODE_ID, 'c', 'c-concurrent');
    const { renameFolderByPath } = await importRepository();

    const result = await renameFolderByPath({
      userId: USER_ID,
      dockspaceId: DOCKSPACE_ID,
      folderPath: '/a',
      newName: 'c',
      nowIso: NOW
    });

    expect(result.status).toBe('CONFLICT');
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'c').map((entry) => entry.childId)).toEqual(['c-concurrent']);
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'a')).toHaveLength(1);
  });

  it('rename retries and succeeds when an unrelated sibling was added concurrently', async () => {
    table.seed([rootNode(), ...folder(ROOT_FOLDER_NODE_ID, 'a', 'a-1')]);
    injectConcurrentSibling(ROOT_FOLDER_NODE_ID, 'unrelated', 'u-1');
    const { renameFolderByPath } = await importRepository();

    const result = await renameFolderByPath({
      userId: USER_ID,
      dockspaceId: DOCKSPACE_ID,
      folderPath: '/a',
      newName: 'b',
      nowIso: NOW
    });

    expect(result).toEqual({ status: 'RENAMED', folderPath: '/b' });
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'b').map((entry) => entry.childId)).toEqual(['a-1']);
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'a')).toHaveLength(0);
    expect(table.get<FolderNodeItem>(PK, 'F#a-1')!.name).toBe('b');
    expect(table.get<FolderNodeItem>(PK, buildFolderNodeSk(ROOT_FOLDER_NODE_ID))!.childrenVersion).toBe(2);
  });

  it('move reports CONFLICT instead of creating a duplicate in the target folder', async () => {
    table.seed([
      rootNode(),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'docs-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'archive', 'archive-1')
    ]);
    injectConcurrentSibling('archive-1', 'docs', 'docs-concurrent');
    const { moveFolderByPath } = await importRepository();

    const result = await moveFolderByPath({
      userId: USER_ID,
      dockspaceId: DOCKSPACE_ID,
      sourceFolderPath: '/docs',
      targetFolderPath: '/archive',
      nowIso: NOW
    });

    expect(result.status).toBe('CONFLICT');
    expect(foldersNamed('archive-1', 'docs').map((entry) => entry.childId)).toEqual(['docs-concurrent']);
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'docs').map((entry) => entry.childId)).toEqual(['docs-1']);
  });

  it('move retries and succeeds when an unrelated sibling was added to the target concurrently', async () => {
    table.seed([
      rootNode(),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'docs-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'archive', 'archive-1')
    ]);
    injectConcurrentSibling('archive-1', 'unrelated', 'u-1');
    const { moveFolderByPath } = await importRepository();

    const result = await moveFolderByPath({
      userId: USER_ID,
      dockspaceId: DOCKSPACE_ID,
      sourceFolderPath: '/docs',
      targetFolderPath: '/archive',
      nowIso: NOW
    });

    expect(result).toEqual({ status: 'MOVED', from: '/docs', to: '/archive/docs' });
    expect(foldersNamed('archive-1', 'docs').map((entry) => entry.childId)).toEqual(['docs-1']);
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'docs')).toHaveLength(0);
    expect(table.get<FolderNodeItem>(PK, 'F#docs-1')!.parentFolderNodeId).toBe('archive-1');
  });
});
