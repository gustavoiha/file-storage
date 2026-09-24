import { QueryCommand, ScanCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildDirectoryNamePrefix,
  buildDirectoryPrefix,
  buildDirectorySk,
  buildFileNodeSk,
  buildFilePk,
  buildFolderNodeSk,
  type DirectoryKind
} from '../domain/keys.js';
import { normalizeNodeName } from '../domain/path.js';
import type { DirectoryItem } from '../types/models.js';
import { dynamoDoc } from './clients.js';

/**
 * One-time repair for folders that were created more than once under the same parent
 * with the same (normalized) name.
 *
 * Background: the "upload a folder" feature confirms several files in parallel. Before the
 * children-version guard existed, each confirm-upload request that could not find the
 * target folder created its own copy, so a single upload could end up with e.g. three
 * `test` folders side by side, each holding a subset of the files.
 *
 * Strategy: for every (partition, parent, normalizedName) group with more than one folder
 * entry, keep the entry with the lowest SK as canonical (this is the one path resolution
 * has always returned, because lookups use `Limit: 1` on the same SK prefix) and merge the
 * others into it, recursively. Nothing is ever dropped: a file whose name is already taken
 * in the canonical folder is moved with a ` (n)` suffix, and a duplicate folder is only
 * deleted once it is verified empty. Every move is a single DynamoDB transaction.
 */

const requiredTableName = (): string => {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('Missing required env var: TABLE_NAME');
  }

  return tableName;
};

export interface MigrateDuplicateFoldersOptions {
  /** Defaults to true: report what would change without writing anything. */
  dryRun?: boolean;
  pageSize?: number;
  maxPages?: number;
  /** Restrict the run to one dockspace partition (uses a Query instead of a table Scan). */
  partition?: { userId: string; dockspaceId: string };
}

export interface MigrateDuplicateFoldersResult {
  dryRun: boolean;
  /** Folder directory entries examined. */
  scannedCount: number;
  duplicateGroupsFound: number;
  /** Duplicate folders merged into their canonical sibling (including nested ones). */
  foldersMerged: number;
  filesMoved: number;
  /** Subset of filesMoved that needed a ` (n)` suffix because the name was taken. */
  filesRenamed: number;
  /** Subfolders re-parented from a duplicate into its canonical folder. */
  foldersMoved: number;
  directoryEntriesDeleted: number;
  folderNodesDeleted: number;
  errors: string[];
  /** Human readable list of actions (taken, or planned in dry-run mode). */
  actions: string[];
}

interface DuplicateGroup {
  pk: string;
  parentFolderNodeId: string;
  normalizedName: string;
  entries: DirectoryItem[];
}

interface Context {
  tableName: string;
  dryRun: boolean;
  result: MigrateDuplicateFoldersResult;
}

const MAX_RENAME_ATTEMPTS = 1000;

const listDirectoryChildren = async (
  tableName: string,
  pk: string,
  parentFolderNodeId: string
): Promise<DirectoryItem[]> => {
  const items: DirectoryItem[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await dynamoDoc.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
          ':pk': pk,
          ':skPrefix': buildDirectoryPrefix(parentFolderNodeId)
        },
        ConsistentRead: true,
        ExclusiveStartKey: exclusiveStartKey
      })
    );

    items.push(...((response.Items ?? []) as DirectoryItem[]));
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items;
};

const listDirectoryEntriesByName = async (
  tableName: string,
  pk: string,
  parentFolderNodeId: string,
  kind: DirectoryKind,
  normalizedName: string
): Promise<DirectoryItem[]> => {
  const response = await dynamoDoc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': pk,
        ':skPrefix': buildDirectoryNamePrefix(parentFolderNodeId, kind, normalizedName)
      },
      ConsistentRead: true
    })
  );

  return ((response.Items ?? []) as DirectoryItem[]).sort((a, b) => a.SK.localeCompare(b.SK));
};

const findDirectoryEntryByName = async (
  tableName: string,
  pk: string,
  parentFolderNodeId: string,
  kind: DirectoryKind,
  name: string
): Promise<DirectoryItem | null> => {
  const entries = await listDirectoryEntriesByName(
    tableName,
    pk,
    parentFolderNodeId,
    kind,
    normalizeNodeName(name)
  );
  return entries[0] ?? null;
};

const splitFileName = (name: string): { base: string; extension: string } => {
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0) {
    return { base: name, extension: '' };
  }

  return { base: name.slice(0, dotIndex), extension: name.slice(dotIndex) };
};

const nextAvailableFileName = async (
  tableName: string,
  pk: string,
  targetFolderNodeId: string,
  name: string
): Promise<string> => {
  const { base, extension } = splitFileName(name);

  for (let counter = 2; counter < MAX_RENAME_ATTEMPTS + 2; counter += 1) {
    const candidate = `${base} (${counter})${extension}`;
    const taken = await findDirectoryEntryByName(tableName, pk, targetFolderNodeId, 'L', candidate);
    if (!taken) {
      return candidate;
    }
  }

  throw new Error(`Could not find a free name for "${name}" in folder ${targetFolderNodeId}`);
};

const record = (context: Context, action: string): void => {
  context.result.actions.push(action);
  console.log(`[migrate] ${context.dryRun ? '(dry-run) ' : ''}${action}`);
};

/** Re-parents one directory entry (file or folder) under `targetFolderNodeId`. */
const moveDirectoryEntry = async (
  context: Context,
  pk: string,
  entry: DirectoryItem,
  targetFolderNodeId: string,
  newName: string
): Promise<void> => {
  const kind: DirectoryKind = entry.childType === 'folder' ? 'F' : 'L';
  const normalizedName = normalizeNodeName(newName);
  const nodeSk =
    entry.childType === 'folder' ? buildFolderNodeSk(entry.childId) : buildFileNodeSk(entry.childId);
  const renamed = newName !== entry.name;

  record(
    context,
    `MOVE ${entry.childType} "${entry.name}" (${entry.childId}) from folder ${entry.parentFolderNodeId} ` +
      `to folder ${targetFolderNodeId}${renamed ? ` as "${newName}"` : ''}`
  );

  if (context.dryRun) {
    return;
  }

  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: context.tableName,
            Item: {
              ...entry,
              SK: buildDirectorySk(targetFolderNodeId, kind, normalizedName, entry.childId),
              name: newName,
              normalizedName,
              parentFolderNodeId: targetFolderNodeId
            } as DirectoryItem,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
          }
        },
        {
          Delete: {
            TableName: context.tableName,
            Key: { PK: pk, SK: entry.SK },
            ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)'
          }
        },
        {
          Update: {
            TableName: context.tableName,
            Key: { PK: pk, SK: nodeSk },
            ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
            UpdateExpression: renamed
              ? 'SET parentFolderNodeId = :parentFolderNodeId, #name = :name'
              : 'SET parentFolderNodeId = :parentFolderNodeId',
            ...(renamed ? { ExpressionAttributeNames: { '#name': 'name' } } : {}),
            ExpressionAttributeValues: {
              ':parentFolderNodeId': targetFolderNodeId,
              ...(renamed ? { ':name': newName } : {})
            }
          }
        }
      ]
    })
  );
};

/**
 * Deletes a folder's directory entry and node, but only once it has no children left.
 * Returns false (and records an error) when the folder is not empty.
 */
const deleteEmptyFolder = async (
  context: Context,
  pk: string,
  entry: DirectoryItem
): Promise<boolean> => {
  if (!context.dryRun) {
    const remaining = await listDirectoryChildren(context.tableName, pk, entry.childId);
    if (remaining.length > 0) {
      context.result.errors.push(
        `Folder "${entry.name}" (${entry.childId}) still has ${remaining.length} child entr` +
          `${remaining.length === 1 ? 'y' : 'ies'} after merge; left in place`
      );
      return false;
    }
  }

  record(context, `DELETE empty duplicate folder "${entry.name}" (${entry.childId}) under ${entry.parentFolderNodeId}`);

  if (!context.dryRun) {
    await dynamoDoc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: context.tableName,
              Key: { PK: pk, SK: entry.SK },
              ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)'
            }
          },
          {
            Delete: {
              TableName: context.tableName,
              Key: { PK: pk, SK: buildFolderNodeSk(entry.childId) }
            }
          }
        ]
      })
    );
  }

  context.result.directoryEntriesDeleted += 1;
  context.result.folderNodesDeleted += 1;
  return true;
};

/** Moves every child of `sourceEntry`'s folder into `targetFolderNodeId`, then removes it. */
const mergeFolderInto = async (
  context: Context,
  pk: string,
  sourceEntry: DirectoryItem,
  targetFolderNodeId: string
): Promise<void> => {
  const sourceFolderNodeId = sourceEntry.childId;
  record(
    context,
    `MERGE folder "${sourceEntry.name}" (${sourceFolderNodeId}) into canonical folder ${targetFolderNodeId}`
  );

  const children = await listDirectoryChildren(context.tableName, pk, sourceFolderNodeId);

  for (const child of children) {
    if (child.childType === 'folder') {
      const existingInTarget = await findDirectoryEntryByName(
        context.tableName,
        pk,
        targetFolderNodeId,
        'F',
        child.name
      );

      if (existingInTarget && existingInTarget.childId !== child.childId) {
        await mergeFolderInto(context, pk, child, existingInTarget.childId);
        continue;
      }

      await moveDirectoryEntry(context, pk, child, targetFolderNodeId, child.name);
      context.result.foldersMoved += 1;
      continue;
    }

    const existingFile = await findDirectoryEntryByName(
      context.tableName,
      pk,
      targetFolderNodeId,
      'L',
      child.name
    );
    const newName = existingFile
      ? await nextAvailableFileName(context.tableName, pk, targetFolderNodeId, child.name)
      : child.name;

    await moveDirectoryEntry(context, pk, child, targetFolderNodeId, newName);
    context.result.filesMoved += 1;
    if (newName !== child.name) {
      context.result.filesRenamed += 1;
    }
  }

  if (await deleteEmptyFolder(context, pk, sourceEntry)) {
    context.result.foldersMerged += 1;
  }
};

const collectFolderDirectoryEntries = async (
  tableName: string,
  options: MigrateDuplicateFoldersOptions,
  result: MigrateDuplicateFoldersResult
): Promise<DirectoryItem[]> => {
  const pageSize = options.pageSize ?? 100;
  const entries: DirectoryItem[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  let pageCount = 0;

  do {
    const page = options.partition
      ? await dynamoDoc.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            FilterExpression: 'childType = :folderType',
            ExpressionAttributeValues: {
              ':pk': buildFilePk(options.partition.userId, options.partition.dockspaceId),
              ':skPrefix': 'D#',
              ':folderType': 'folder'
            },
            ConsistentRead: true,
            ExclusiveStartKey: exclusiveStartKey,
            Limit: pageSize
          })
        )
      : await dynamoDoc.send(
          new ScanCommand({
            TableName: tableName,
            FilterExpression: '#type = :directoryType AND childType = :folderType',
            ExpressionAttributeNames: { '#type': 'type' },
            ExpressionAttributeValues: {
              ':directoryType': 'DIRECTORY',
              ':folderType': 'folder'
            },
            ExclusiveStartKey: exclusiveStartKey,
            Limit: pageSize
          })
        );

    pageCount += 1;
    const items = (page.Items ?? []) as DirectoryItem[];
    entries.push(...items);
    result.scannedCount += items.length;
    exclusiveStartKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;

    console.log(`[migrate] Read page ${pageCount}: ${result.scannedCount} folder entries so far`);
  } while (exclusiveStartKey && (!options.maxPages || pageCount < options.maxPages));

  return entries;
};

export const migrateDuplicateFolders = async (
  options: MigrateDuplicateFoldersOptions = {}
): Promise<MigrateDuplicateFoldersResult> => {
  const dryRun = options.dryRun ?? true;
  const tableName = requiredTableName();

  const result: MigrateDuplicateFoldersResult = {
    dryRun,
    scannedCount: 0,
    duplicateGroupsFound: 0,
    foldersMerged: 0,
    filesMoved: 0,
    filesRenamed: 0,
    foldersMoved: 0,
    directoryEntriesDeleted: 0,
    folderNodesDeleted: 0,
    errors: [],
    actions: []
  };
  const context: Context = { tableName, dryRun, result };

  console.log(
    `[migrate] Starting (dryRun=${dryRun}, scope=${
      options.partition ? `${options.partition.userId}/${options.partition.dockspaceId}` : 'whole table'
    })`
  );

  const entries = await collectFolderDirectoryEntries(tableName, options, result);

  const groups = new Map<string, DuplicateGroup>();
  for (const entry of entries) {
    const groupKey = `${entry.PK}\u0000${entry.parentFolderNodeId}\u0000${entry.normalizedName}`;
    const group = groups.get(groupKey);
    if (group) {
      group.entries.push(entry);
    } else {
      groups.set(groupKey, {
        pk: entry.PK,
        parentFolderNodeId: entry.parentFolderNodeId,
        normalizedName: entry.normalizedName,
        entries: [entry]
      });
    }
  }

  const duplicateGroups = [...groups.values()].filter((group) => group.entries.length > 1);
  result.duplicateGroupsFound = duplicateGroups.length;
  console.log(
    `[migrate] ${result.scannedCount} folder entries, ${duplicateGroups.length} duplicate group(s)`
  );

  for (const group of duplicateGroups) {
    try {
      // Re-read live: an earlier merge in this run may already have changed this group.
      const liveEntries = dryRun
        ? [...group.entries].sort((a, b) => a.SK.localeCompare(b.SK))
        : await listDirectoryEntriesByName(
            tableName,
            group.pk,
            group.parentFolderNodeId,
            'F',
            group.normalizedName
          );

      if (liveEntries.length < 2) {
        record(
          context,
          `SKIP group "${group.normalizedName}" under ${group.parentFolderNodeId}: no longer duplicated`
        );
        continue;
      }

      const [canonical, ...duplicates] = liveEntries as [DirectoryItem, ...DirectoryItem[]];
      record(
        context,
        `GROUP "${canonical.name}" under folder ${group.parentFolderNodeId} in ${group.pk}: ` +
          `canonical=${canonical.childId}, duplicates=${duplicates.map((d) => d.childId).join(',')}`
      );

      for (const duplicate of duplicates) {
        await mergeFolderInto(context, group.pk, duplicate, canonical.childId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(
        `Failed to merge group "${group.normalizedName}" under ${group.parentFolderNodeId} in ${group.pk}: ${message}`
      );
      console.error(`[migrate] ERROR: ${message}`);
    }
  }

  console.log(`[migrate] Done. ${result.errors.length} error(s).`);
  return result;
};

export interface DockspacePartition {
  userId: string;
  dockspaceId: string;
  name: string;
}

export interface MigrateAllDockspacesResult {
  dryRun: boolean;
  dockspacesFound: number;
  dockspacesWithDuplicates: number;
  totals: Omit<MigrateDuplicateFoldersResult, 'dryRun' | 'errors' | 'actions'>;
  errors: string[];
  dockspaces: Array<DockspacePartition & { result: MigrateDuplicateFoldersResult }>;
}

/** Lists every dockspace in the table (one DOCKSPACE item per user + dockspace). */
export const listAllDockspacePartitions = async (
  tableName: string,
  pageSize = 100
): Promise<DockspacePartition[]> => {
  const partitions = new Map<string, DockspacePartition>();
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const page = await dynamoDoc.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: '#type = :dockspaceType',
        ExpressionAttributeNames: { '#type': 'type' },
        ExpressionAttributeValues: { ':dockspaceType': 'DOCKSPACE' },
        ExclusiveStartKey: exclusiveStartKey,
        Limit: pageSize
      })
    );

    for (const item of (page.Items ?? []) as Array<{
      userId?: string;
      dockspaceId?: string;
      name?: string;
    }>) {
      if (!item.userId || !item.dockspaceId) {
        continue;
      }

      partitions.set(`${item.userId}\u0000${item.dockspaceId}`, {
        userId: item.userId,
        dockspaceId: item.dockspaceId,
        name: item.name ?? ''
      });
    }

    exclusiveStartKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return [...partitions.values()].sort(
    (a, b) => a.userId.localeCompare(b.userId) || a.dockspaceId.localeCompare(b.dockspaceId)
  );
};

/**
 * Runs the duplicate-folder migration for every dockspace of every user, one partition at a
 * time (each partition is read with a Query rather than a table Scan), and aggregates the
 * per-dockspace results. A failure in one dockspace is recorded and does not stop the others.
 */
export const migrateDuplicateFoldersForAllDockspaces = async (
  options: Omit<MigrateDuplicateFoldersOptions, 'partition'> = {}
): Promise<MigrateAllDockspacesResult> => {
  const dryRun = options.dryRun ?? true;
  const tableName = requiredTableName();
  const partitions = await listAllDockspacePartitions(tableName, options.pageSize);

  console.log(`[migrate] Found ${partitions.length} dockspace(s) (dryRun=${dryRun})`);

  const result: MigrateAllDockspacesResult = {
    dryRun,
    dockspacesFound: partitions.length,
    dockspacesWithDuplicates: 0,
    totals: {
      scannedCount: 0,
      duplicateGroupsFound: 0,
      foldersMerged: 0,
      filesMoved: 0,
      filesRenamed: 0,
      foldersMoved: 0,
      directoryEntriesDeleted: 0,
      folderNodesDeleted: 0
    },
    errors: [],
    dockspaces: []
  };

  for (const partition of partitions) {
    console.log(
      `[migrate] === user ${partition.userId} / dockspace ${partition.dockspaceId} ("${partition.name}") ===`
    );

    try {
      const partitionResult = await migrateDuplicateFolders({ ...options, dryRun, partition });
      result.dockspaces.push({ ...partition, result: partitionResult });

      if (partitionResult.duplicateGroupsFound > 0) {
        result.dockspacesWithDuplicates += 1;
      }

      for (const key of Object.keys(result.totals) as Array<keyof MigrateAllDockspacesResult['totals']>) {
        result.totals[key] += partitionResult[key];
      }

      result.errors.push(
        ...partitionResult.errors.map(
          (message) => `[${partition.userId}/${partition.dockspaceId}] ${message}`
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`[${partition.userId}/${partition.dockspaceId}] ${message}`);
      console.error(`[migrate] ERROR in dockspace ${partition.dockspaceId}: ${message}`);
    }
  }

  console.log(
    `[migrate] All dockspaces done: ${result.dockspacesWithDuplicates}/${result.dockspacesFound} had duplicates, ` +
      `${result.totals.foldersMerged} folder(s) merged, ${result.totals.filesMoved} file(s) moved, ${result.errors.length} error(s).`
  );

  return result;
};
