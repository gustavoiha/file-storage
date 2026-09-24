import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDirectorySk,
  buildFileNodeSk,
  buildFilePk,
  buildFolderNodeSk,
  ROOT_FOLDER_NODE_ID
} from '../domain/keys.js';
import { normalizeNodeName } from '../domain/path.js';
import type { DirectoryItem, FileNodeItem, FolderNodeItem } from '../types/models.js';
import { FakeDynamoTable } from './helpers/fakeDynamoTable.js';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn()
}));

vi.mock('../lib/clients.js', () => ({
  dynamoDoc: { send: sendMock }
}));

let table: FakeDynamoTable;

beforeEach(() => {
  process.env.TABLE_NAME = 'test-table';
  process.env.BUCKET_NAME = 'test-bucket';
  table = new FakeDynamoTable();
  sendMock.mockReset();
  sendMock.mockImplementation((command: unknown) => table.send(command));
  vi.resetModules();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const USER_ID = 'user-1';
const DOCKSPACE_ID = 'dock-1';
const PK = buildFilePk(USER_ID, DOCKSPACE_ID);
const NOW = '2026-09-24T13:37:53.000Z';

type Item = object;

const rootNode = (pk = PK): FolderNodeItem => ({
  PK: pk,
  SK: buildFolderNodeSk(ROOT_FOLDER_NODE_ID),
  type: 'FOLDER_NODE',
  name: '/',
  createdAt: NOW,
  updatedAt: NOW
});

const folder = (parentFolderNodeId: string, name: string, id: string, pk = PK): Item[] => {
  const normalizedName = normalizeNodeName(name);
  const node: FolderNodeItem = {
    PK: pk,
    SK: buildFolderNodeSk(id),
    type: 'FOLDER_NODE',
    parentFolderNodeId,
    name,
    createdAt: NOW,
    updatedAt: NOW
  };
  const directory: DirectoryItem = {
    PK: pk,
    SK: buildDirectorySk(parentFolderNodeId, 'F', normalizedName, id),
    type: 'DIRECTORY',
    name,
    normalizedName,
    childId: id,
    childType: 'folder',
    parentFolderNodeId,
    createdAt: NOW,
    updatedAt: NOW
  };
  return [node, directory];
};

const file = (parentFolderNodeId: string, name: string, id: string, pk = PK): Item[] => {
  const normalizedName = normalizeNodeName(name);
  const node: FileNodeItem = {
    PK: pk,
    SK: buildFileNodeSk(id),
    type: 'FILE_NODE',
    parentFolderNodeId,
    s3Key: `${DOCKSPACE_ID}/${id}`,
    name,
    contentHash: 'a'.repeat(64),
    size: 100,
    contentType: 'application/pdf',
    etag: `etag-${id}`,
    createdAt: NOW,
    updatedAt: NOW
  };
  const directory: DirectoryItem = {
    PK: pk,
    SK: buildDirectorySk(parentFolderNodeId, 'L', normalizedName, id),
    type: 'DIRECTORY',
    name,
    normalizedName,
    childId: id,
    childType: 'file',
    parentFolderNodeId,
    createdAt: NOW,
    updatedAt: NOW
  };
  return [node, directory];
};

const directories = (pk = PK): DirectoryItem[] =>
  table.itemsWhere<DirectoryItem>((item) => item.PK === pk && item.type === 'DIRECTORY');

const folderNodes = (pk = PK): FolderNodeItem[] =>
  table.itemsWhere<FolderNodeItem>((item) => item.PK === pk && item.type === 'FOLDER_NODE');

const fileNodes = (pk = PK): FileNodeItem[] =>
  table.itemsWhere<FileNodeItem>((item) => item.PK === pk && item.type === 'FILE_NODE');

/** Full path of every file, derived from directory entries (what the UI navigates). */
const filePaths = (pk = PK): string[] => {
  const entries = directories(pk);
  const byChildId = new Map(entries.map((entry) => [entry.childId, entry]));
  const pathOf = (folderNodeId: string): string => {
    if (folderNodeId === ROOT_FOLDER_NODE_ID) {
      return '';
    }
    const entry = byChildId.get(folderNodeId);
    if (!entry) {
      throw new Error(`Folder ${folderNodeId} has no directory entry`);
    }
    return `${pathOf(entry.parentFolderNodeId)}/${entry.name}`;
  };

  return entries
    .filter((entry) => entry.childType === 'file')
    .map((entry) => `${pathOf(entry.parentFolderNodeId)}/${entry.name}`)
    .sort();
};

const foldersNamed = (parentFolderNodeId: string, name: string, pk = PK): DirectoryItem[] =>
  directories(pk).filter(
    (entry) =>
      entry.childType === 'folder' &&
      entry.parentFolderNodeId === parentFolderNodeId &&
      entry.normalizedName === normalizeNodeName(name)
  );

const expectConsistentTree = (pk = PK): void => {
  const entries = directories(pk);
  const folderIds = new Set(folderNodes(pk).map((node) => node.SK.slice(2)));
  folderIds.add(ROOT_FOLDER_NODE_ID);

  for (const entry of entries) {
    expect(folderIds.has(entry.parentFolderNodeId), `parent of ${entry.SK} exists`).toBe(true);
    expect(entry.SK).toBe(
      buildDirectorySk(
        entry.parentFolderNodeId,
        entry.childType === 'folder' ? 'F' : 'L',
        entry.normalizedName,
        entry.childId
      )
    );
  }

  for (const node of fileNodes(pk)) {
    const nodeId = node.SK.slice(2);
    const matching = entries.filter((entry) => entry.childType === 'file' && entry.childId === nodeId);
    expect(matching, `file ${node.name} has exactly one directory entry`).toHaveLength(1);
    expect(matching[0]!.parentFolderNodeId).toBe(node.parentFolderNodeId);
    expect(matching[0]!.name).toBe(node.name);
  }

  for (const node of folderNodes(pk)) {
    const nodeId = node.SK.slice(2);
    if (nodeId === ROOT_FOLDER_NODE_ID) {
      continue;
    }
    const matching = entries.filter((entry) => entry.childType === 'folder' && entry.childId === nodeId);
    expect(matching, `folder ${node.name} has exactly one directory entry`).toHaveLength(1);
    expect(matching[0]!.parentFolderNodeId).toBe(node.parentFolderNodeId);
  }
};

const importMigrate = async () => (await import('../lib/migrateDuplicateFolders.js')).migrateDuplicateFolders;
const importMigrateAll = async () =>
  (await import('../lib/migrateDuplicateFolders.js')).migrateDuplicateFoldersForAllDockspaces;

const dockspace = (userId: string, dockspaceId: string, name: string): Item => ({
  PK: `U#${userId}`,
  SK: `S#${dockspaceId}`,
  type: 'DOCKSPACE',
  userId,
  dockspaceId,
  name,
  createdAt: NOW
});

// ---------------------------------------------------------------------------
// The exact structure observed in dockspace-dev after uploading /Documents/test
// (three `test` folders under a/v, two `test-b/test-c` chains under the main one).
// ---------------------------------------------------------------------------

const TEST_ROOT_FILES = [
  'moradia-Recibos.pdf',
  'NIF Brayan Miranda.pdf',
  'moradia-declaracao-arrendamento-portal-das-financas.pdf',
  'moradia-Recibo janeiro.pdf',
  'moradia-Recibo fevereiro.pdf',
  'moradia-contrato-paco-da-rainha-financas.pdf'
];
const TEST_A_FILES = [
  'gustavo-agendamento-aima.pdf',
  '180825 Gustavo Iha 🇵🇹 Reaktor LX employment contract.pdf',
  'moradia-declaracao-arrendamento-portal-das-financas.pdf',
  'declaracao-moradia.pdf',
  'brayan-agendamento-aima.pdf',
  'moradia-contrato-paco-da-rainha-financas.pdf'
];
const TEST_C_FILES = [
  'reaktor-payslip-2025-12.pdf',
  'reaktor-payslip-2025-11.pdf',
  'seguro-saude-brayan.PDF',
  'Termo de Responsabilidade - Gustavo Moraes.pdf'
];

const seedProductionShape = (): void => {
  let fileCounter = 0;
  const f = (parent: string, name: string) => file(parent, name, `file-${(fileCounter += 1)}`);

  table.seed([
    rootNode(),
    ...folder(ROOT_FOLDER_NODE_ID, 'a', 'folder-a'),
    ...folder('folder-a', 'v', 'folder-v'),
    // Three `test` folders; `test-1` has the lowest SK and is therefore canonical.
    ...folder('folder-v', 'test', 'test-1'),
    ...folder('folder-v', 'test', 'test-2'), // empty (its upload failed and was retried)
    ...folder('folder-v', 'test', 'test-3'),
    ...f('test-3', 'moradia-declaracao-arrendamento-portal-das-financas.pdf'),
    ...TEST_ROOT_FILES.filter((name) => !name.startsWith('moradia-declaracao')).flatMap((name) =>
      f('test-1', name)
    ),
    ...folder('test-1', 'test-a', 'test-a-1'),
    ...TEST_A_FILES.flatMap((name) => f('test-a-1', name)),
    // Two `test-b` folders, each with its own `test-c`.
    ...folder('test-1', 'test-b', 'test-b-1'),
    ...folder('test-b-1', 'test-c', 'test-c-1'),
    ...TEST_C_FILES.filter((name) => !name.endsWith('2025-12.pdf')).flatMap((name) => f('test-c-1', name)),
    ...folder('test-1', 'test-b', 'test-b-2'),
    ...folder('test-b-2', 'test-c', 'test-c-2'),
    ...f('test-c-2', 'reaktor-payslip-2025-12.pdf')
  ]);
};

const expectedProductionPaths = [
  ...TEST_ROOT_FILES.map((name) => `/a/v/test/${name}`),
  ...TEST_A_FILES.map((name) => `/a/v/test/test-a/${name}`),
  ...TEST_C_FILES.map((name) => `/a/v/test/test-b/test-c/${name}`)
].sort();

describe('migrateDuplicateFolders', () => {
  it('throws when TABLE_NAME is not set', async () => {
    delete process.env.TABLE_NAME;
    const migrate = await importMigrate();
    await expect(migrate({ dryRun: true })).rejects.toThrow('TABLE_NAME');
  });

  it('does nothing when there are no duplicate folders', async () => {
    table.seed([
      rootNode(),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'docs-1'),
      ...folder('docs-1', 'docs', 'docs-nested'), // same name, different parent
      ...folder(ROOT_FOLDER_NODE_ID, 'photos', 'photos-1'),
      ...file('docs-1', 'a.pdf', 'file-1')
    ]);
    const before = table.all();

    const migrate = await importMigrate();
    const result = await migrate({ dryRun: false });

    expect(result.scannedCount).toBe(3);
    expect(result.duplicateGroupsFound).toBe(0);
    expect(result.errors).toEqual([]);
    expect(table.writes).toEqual([]);
    expect(table.all()).toEqual(before);
  });

  it('merges the structure observed in production into a single tree with every file reachable', async () => {
    seedProductionShape();
    expect(filePaths()).toHaveLength(16);

    const migrate = await importMigrate();
    const result = await migrate({ dryRun: false });

    expect(result.errors).toEqual([]);
    expect(result.duplicateGroupsFound).toBe(2);
    expect(result.foldersMerged).toBe(4); // test-2, test-3, test-b-2 and nested test-c-2
    expect(result.filesMoved).toBe(2); // moradia-declaracao... and reaktor-payslip-2025-12
    expect(result.filesRenamed).toBe(0);
    expect(result.foldersMoved).toBe(0);
    expect(result.directoryEntriesDeleted).toBe(4);
    expect(result.folderNodesDeleted).toBe(4);

    expect(foldersNamed('folder-v', 'test').map((entry) => entry.childId)).toEqual(['test-1']);
    expect(foldersNamed('test-1', 'test-b').map((entry) => entry.childId)).toEqual(['test-b-1']);
    expect(foldersNamed('test-b-1', 'test-c').map((entry) => entry.childId)).toEqual(['test-c-1']);
    expect(table.get(PK, buildFolderNodeSk('test-2'))).toBeUndefined();
    expect(table.get(PK, buildFolderNodeSk('test-3'))).toBeUndefined();
    expect(table.get(PK, buildFolderNodeSk('test-b-2'))).toBeUndefined();
    expect(table.get(PK, buildFolderNodeSk('test-c-2'))).toBeUndefined();

    expect(fileNodes()).toHaveLength(16);
    expect(filePaths()).toEqual(expectedProductionPaths);
    expectConsistentTree();

    // Every write was a transaction: no partial Put/Delete sequences.
    expect(new Set(table.writes)).toEqual(new Set(['TransactWriteCommand']));
  });

  it('dry run reports the same plan without writing anything', async () => {
    seedProductionShape();
    const before = table.all();

    const migrate = await importMigrate();
    const result = await migrate();

    expect(result.dryRun).toBe(true);
    expect(result.duplicateGroupsFound).toBe(2);
    expect(result.foldersMerged).toBe(4);
    expect(result.filesMoved).toBe(2);
    expect(result.actions.some((action) => action.startsWith('MOVE file'))).toBe(true);
    expect(result.actions.some((action) => action.startsWith('DELETE empty duplicate folder'))).toBe(true);
    expect(table.writes).toEqual([]);
    expect(table.all()).toEqual(before);
  });

  it('is idempotent: a second run finds nothing to do', async () => {
    seedProductionShape();
    const migrate = await importMigrate();
    await migrate({ dryRun: false });
    const afterFirstRun = table.all();
    table.writes = [];

    const second = await migrate({ dryRun: false });

    expect(second.duplicateGroupsFound).toBe(0);
    expect(table.writes).toEqual([]);
    expect(table.all()).toEqual(afterFirstRun);
  });

  it('keeps both files when the canonical folder already has one with the same name', async () => {
    table.seed([
      rootNode(),
      ...folder(ROOT_FOLDER_NODE_ID, 'Docs', 'docs-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'docs-2'), // differs only by case
      ...file('docs-1', 'readme.txt', 'file-canonical'),
      ...file('docs-1', 'readme (2).txt', 'file-canonical-2'),
      ...file('docs-2', 'readme.txt', 'file-duplicate'),
      ...file('docs-2', 'notes.md', 'file-notes')
    ]);

    const migrate = await importMigrate();
    const result = await migrate({ dryRun: false });

    expect(result.errors).toEqual([]);
    expect(result.filesMoved).toBe(2);
    expect(result.filesRenamed).toBe(1);
    expect(result.foldersMerged).toBe(1);

    const names = directories()
      .filter((entry) => entry.parentFolderNodeId === 'docs-1' && entry.childType === 'file')
      .map((entry) => entry.name)
      .sort();
    expect(names).toEqual(['notes.md', 'readme (2).txt', 'readme (3).txt', 'readme.txt']);

    const movedNode = table.get<FileNodeItem>(PK, buildFileNodeSk('file-duplicate'))!;
    expect(movedNode.name).toBe('readme (3).txt');
    expect(movedNode.parentFolderNodeId).toBe('docs-1');
    expect(fileNodes()).toHaveLength(4);
    expectConsistentTree();
  });

  it('re-parents a subfolder that only exists in the duplicate', async () => {
    table.seed([
      rootNode(),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'docs-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'docs-2'),
      ...folder('docs-2', 'archive', 'archive-1'),
      ...file('archive-1', 'old.pdf', 'file-old')
    ]);

    const migrate = await importMigrate();
    const result = await migrate({ dryRun: false });

    expect(result.errors).toEqual([]);
    expect(result.foldersMoved).toBe(1);
    expect(result.filesMoved).toBe(0);
    expect(result.foldersMerged).toBe(1);

    const archiveNode = table.get<FolderNodeItem>(PK, buildFolderNodeSk('archive-1'))!;
    expect(archiveNode.parentFolderNodeId).toBe('docs-1');
    expect(foldersNamed('docs-1', 'archive').map((entry) => entry.childId)).toEqual(['archive-1']);
    expect(filePaths()).toEqual(['/docs/archive/old.pdf']);
    expectConsistentTree();
  });

  it('merges duplicates that only differ in whitespace/case of the folder name', async () => {
    table.seed([
      rootNode(),
      ...folder(ROOT_FOLDER_NODE_ID, 'My Docs', 'docs-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'my  docs', 'docs-2'),
      ...file('docs-2', 'a.pdf', 'file-a')
    ]);

    const migrate = await importMigrate();
    const result = await migrate({ dryRun: false });

    expect(result.errors).toEqual([]);
    expect(result.foldersMerged).toBe(1);
    expect(filePaths()).toEqual(['/My Docs/a.pdf']);
    expectConsistentTree();
  });

  it('never deletes a duplicate folder whose contents could not be moved', async () => {
    table.seed([
      rootNode(),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'docs-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'docs-2'),
      ...file('docs-2', 'fine.pdf', 'file-fine'),
      // Directory entry whose FILE_NODE is missing: the move transaction must fail.
      file('docs-2', 'broken.pdf', 'file-broken')[1]!,
      ...folder(ROOT_FOLDER_NODE_ID, 'photos', 'photos-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'photos', 'photos-2'),
      ...file('photos-2', 'img.jpg', 'file-img')
    ]);

    const migrate = await importMigrate();
    const result = await migrate({ dryRun: false });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('docs');
    // The broken group is left untouched apart from nothing being lost...
    expect(table.get(PK, buildFolderNodeSk('docs-2'))).toBeDefined();
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'docs')).toHaveLength(2);
    expect(
      directories().find((entry) => entry.childId === 'file-broken')?.parentFolderNodeId
    ).toBe('docs-2');
    // ...while the healthy group is still processed.
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'photos').map((entry) => entry.childId)).toEqual(['photos-1']);
    expect(filePaths()).toContain('/photos/img.jpg');
  });

  it('finds duplicates across scan pages', async () => {
    table.seed([
      rootNode(),
      ...folder(ROOT_FOLDER_NODE_ID, 'a', 'a-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'b', 'b-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'c', 'c-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'z', 'z-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'z', 'z-2')
    ]);

    const migrate = await importMigrate();
    const result = await migrate({ dryRun: false, pageSize: 2 });

    expect(result.scannedCount).toBe(5);
    expect(result.duplicateGroupsFound).toBe(1);
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'z').map((entry) => entry.childId)).toEqual(['z-1']);
    expect(table.commands.filter((command) => command.constructor.name === 'ScanCommand').length).toBeGreaterThan(1);
  });

  it('respects maxPages', async () => {
    table.seed([
      rootNode(),
      ...folder(ROOT_FOLDER_NODE_ID, 'a', 'a-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'b', 'b-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'c', 'c-1')
    ]);

    const migrate = await importMigrate();
    const result = await migrate({ dryRun: true, pageSize: 1, maxPages: 2 });

    expect(result.scannedCount).toBe(2);
  });

  it('can be scoped to a single dockspace partition using a Query', async () => {
    const otherPk = buildFilePk('user-2', 'dock-2');
    table.seed([
      rootNode(),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'docs-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'docs-2'),
      rootNode(otherPk),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'other-docs-1', otherPk),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'other-docs-2', otherPk)
    ]);

    const migrate = await importMigrate();
    const result = await migrate({
      dryRun: false,
      partition: { userId: USER_ID, dockspaceId: DOCKSPACE_ID }
    });

    expect(result.errors).toEqual([]);
    expect(result.duplicateGroupsFound).toBe(1);
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'docs')).toHaveLength(1);
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'docs', otherPk)).toHaveLength(2);
    expect(table.commands.some((command) => command.constructor.name === 'ScanCommand')).toBe(false);
  });

});

describe('migrateDuplicateFoldersForAllDockspaces', () => {
  it('processes every dockspace of every user and aggregates the results', async () => {
    const otherPk = buildFilePk('user-2', 'dock-2');
    const cleanPk = buildFilePk('user-2', 'dock-3');
    table.seed([
      dockspace(USER_ID, DOCKSPACE_ID, 'gustavoiha'),
      dockspace('user-2', 'dock-2', 'photos'),
      dockspace('user-2', 'dock-3', 'clean'),
      rootNode(),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'docs-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'docs-2'),
      ...file('docs-2', 'a.pdf', 'file-a'),
      rootNode(otherPk),
      ...folder(ROOT_FOLDER_NODE_ID, 'trip', 'trip-1', otherPk),
      ...folder(ROOT_FOLDER_NODE_ID, 'trip', 'trip-2', otherPk),
      ...folder(ROOT_FOLDER_NODE_ID, 'trip', 'trip-3', otherPk),
      ...file('trip-3', 'b.jpg', 'file-b', otherPk),
      rootNode(cleanPk),
      ...folder(ROOT_FOLDER_NODE_ID, 'solo', 'solo-1', cleanPk)
    ]);

    const migrateAll = await importMigrateAll();
    const result = await migrateAll({ dryRun: false });

    expect(result.errors).toEqual([]);
    expect(result.dockspacesFound).toBe(3);
    expect(result.dockspacesWithDuplicates).toBe(2);
    expect(result.dockspaces.map((entry) => [entry.userId, entry.dockspaceId, entry.name])).toEqual([
      ['user-1', 'dock-1', 'gustavoiha'],
      ['user-2', 'dock-2', 'photos'],
      ['user-2', 'dock-3', 'clean']
    ]);
    expect(result.totals.duplicateGroupsFound).toBe(2);
    expect(result.totals.foldersMerged).toBe(3);
    expect(result.totals.filesMoved).toBe(2);

    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'docs').map((entry) => entry.childId)).toEqual(['docs-1']);
    expect(filePaths()).toEqual(['/docs/a.pdf']);
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'trip', otherPk).map((entry) => entry.childId)).toEqual(['trip-1']);
    expect(filePaths(otherPk)).toEqual(['/trip/b.jpg']);
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'solo', cleanPk)).toHaveLength(1);
    expectConsistentTree();
    expectConsistentTree(otherPk);

    // The only Scan is the dockspace listing; folder entries are read per partition with Queries.
    const scans = table.commands.filter((command) => command.constructor.name === 'ScanCommand');
    expect(scans.length).toBeGreaterThan(0);
    for (const scan of scans) {
      expect(scan.input.FilterExpression).toBe('#type = :dockspaceType');
    }
  });

  it('dry run across all dockspaces writes nothing', async () => {
    table.seed([dockspace(USER_ID, DOCKSPACE_ID, 'gustavoiha')]);
    seedProductionShape();
    const before = table.all();

    const migrateAll = await importMigrateAll();
    const result = await migrateAll();

    expect(result.dryRun).toBe(true);
    expect(result.totals.foldersMerged).toBe(4);
    expect(result.totals.filesMoved).toBe(2);
    expect(table.writes).toEqual([]);
    expect(table.all()).toEqual(before);
  });

  it('continues with the remaining dockspaces when one fails', async () => {
    const otherPk = buildFilePk('user-2', 'dock-2');
    table.seed([
      dockspace(USER_ID, DOCKSPACE_ID, 'first'),
      dockspace('user-2', 'dock-2', 'second'),
      rootNode(),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'docs-1'),
      ...folder(ROOT_FOLDER_NODE_ID, 'docs', 'docs-2'),
      rootNode(otherPk),
      ...folder(ROOT_FOLDER_NODE_ID, 'trip', 'trip-1', otherPk),
      ...folder(ROOT_FOLDER_NODE_ID, 'trip', 'trip-2', otherPk)
    ]);
    table.beforeCommand = (command) => {
      const pk = (command.input.ExpressionAttributeValues as Record<string, unknown> | undefined)?.[':pk'];
      if (command.constructor.name === 'QueryCommand' && pk === PK) {
        throw new Error('partition unavailable');
      }
    };

    const migrateAll = await importMigrateAll();
    const result = await migrateAll({ dryRun: false });

    expect(result.errors).toEqual(['[user-1/dock-1] partition unavailable']);
    expect(result.dockspaces.map((entry) => entry.dockspaceId)).toEqual(['dock-2']);
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'docs')).toHaveLength(2);
    expect(foldersNamed(ROOT_FOLDER_NODE_ID, 'trip', otherPk)).toHaveLength(1);
  });
});
