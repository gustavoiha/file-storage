import { randomUUID } from 'node:crypto';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import {
  buildDirectoryNamePrefix,
  buildDirectorySk,
  buildFileNodeSk,
  buildFilePk,
  buildFolderNodeSk,
  buildDockspacePk,
  buildPurgeDueGsi1Sk,
  PURGE_DUE_GSI1_PK,
  ROOT_FOLDER_NODE_ID,
  type DirectoryKind
} from '../domain/keys.js';
import {
  buildFullPath,
  normalizeFolderPath,
  normalizeNodeName,
  normalizeFullPath,
  splitFolderPath,
  splitFullPath
} from '../domain/path.js';
import type {
  DirectoryItem,
  FileNodeItem,
  FileState,
  FolderNodeItem,
  DockspaceItem
} from '../types/models.js';
import { fileStateFromNode } from '../types/models.js';
import { dynamoDoc } from './clients.js';
import { env } from './env.js';
import { listDirectoryChildrenByParentFolderNodeId as listDirectoryChildrenAction } from './repository/folderChildren.js';

const isConditionalFailure = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'ConditionalCheckFailedException' ||
    error.name === 'TransactionCanceledException');

const getFileNodeIdFromSk = (sk: string): string => sk.replace(/^L#/, '');

const queryAll = async <T>(
  input: Omit<ConstructorParameters<typeof QueryCommand>[0], 'TableName'>
): Promise<T[]> => {
  const items: T[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const response = await dynamoDoc.send(
      new QueryCommand({
        TableName: env.tableName,
        ...input,
        ExclusiveStartKey: exclusiveStartKey
      })
    );

    items.push(...((response.Items ?? []) as T[]));
    exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items;
};

const getFileNodeById = async (
  userId: string,
  dockspaceId: string,
  fileNodeId: string
): Promise<FileNodeItem | null> => {
  const response = await dynamoDoc.send(
    new GetCommand({
      TableName: env.tableName,
      Key: {
        PK: buildFilePk(userId, dockspaceId),
        SK: buildFileNodeSk(fileNodeId)
      }
    })
  );

  return (response.Item as FileNodeItem | undefined) ?? null;
};

const getFolderNodeById = async (
  userId: string,
  dockspaceId: string,
  folderNodeId: string
): Promise<FolderNodeItem | null> => {
  const response = await dynamoDoc.send(
    new GetCommand({
      TableName: env.tableName,
      Key: {
        PK: buildFilePk(userId, dockspaceId),
        SK: buildFolderNodeSk(folderNodeId)
      }
    })
  );

  return (response.Item as FolderNodeItem | undefined) ?? null;
};

const putRootFolderNodeIfMissing = async (
  userId: string,
  dockspaceId: string,
  nowIso: string
): Promise<void> => {
  try {
    await dynamoDoc.send(
      new PutCommand({
        TableName: env.tableName,
        Item: {
          PK: buildFilePk(userId, dockspaceId),
          SK: buildFolderNodeSk(ROOT_FOLDER_NODE_ID),
          type: 'FOLDER_NODE',
          name: '/',
          createdAt: nowIso,
          updatedAt: nowIso
        } as FolderNodeItem,
        ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
      })
    );
  } catch (error) {
    if (!isConditionalFailure(error)) {
      throw error;
    }
  }
};

const putFolderNodeWithDirectory = async (
  userId: string,
  dockspaceId: string,
  parentFolderNodeId: string,
  folderName: string,
  nowIso: string
): Promise<string> => {
  const folderNodeId = randomUUID();
  const normalizedName = normalizeNodeName(folderName);

  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: env.tableName,
            Item: {
              PK: buildFilePk(userId, dockspaceId),
              SK: buildFolderNodeSk(folderNodeId),
              type: 'FOLDER_NODE',
              parentFolderNodeId,
              name: folderName,
              createdAt: nowIso,
              updatedAt: nowIso
            } as FolderNodeItem,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
          }
        },
        {
          Put: {
            TableName: env.tableName,
            Item: {
              PK: buildFilePk(userId, dockspaceId),
              SK: buildDirectorySk(parentFolderNodeId, 'F', normalizedName, folderNodeId),
              type: 'DIRECTORY',
              name: folderName,
              normalizedName,
              childId: folderNodeId,
              childType: 'folder',
              parentFolderNodeId,
              createdAt: nowIso,
              updatedAt: nowIso
            } as DirectoryItem,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
          }
        }
      ]
    })
  );

  return folderNodeId;
};

export const putDockspace = async (dockspace: DockspaceItem): Promise<void> => {
  await dynamoDoc.send(
    new PutCommand({
      TableName: env.tableName,
      Item: dockspace
    })
  );
};

export const putDockspaceWithRootFolder = async (
  dockspace: DockspaceItem,
  nowIso: string
): Promise<void> => {
  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: env.tableName,
            Item: dockspace,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
          }
        },
        {
          Put: {
            TableName: env.tableName,
            Item: {
              PK: buildFilePk(dockspace.userId, dockspace.dockspaceId),
              SK: buildFolderNodeSk(ROOT_FOLDER_NODE_ID),
              type: 'FOLDER_NODE',
              name: '/',
              createdAt: nowIso,
              updatedAt: nowIso
            } as FolderNodeItem,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
          }
        }
      ]
    })
  );
};

export const listDockspaces = async (userId: string): Promise<DockspaceItem[]> => {
  const response = await dynamoDoc.send(
    new QueryCommand({
      TableName: env.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': buildDockspacePk(userId),
        ':skPrefix': 'S#'
      }
    })
  );

  return (response.Items ?? []) as DockspaceItem[];
};

const findDirectoryEntryByNameInternal = async (
  userId: string,
  dockspaceId: string,
  parentFolderNodeId: string,
  kind: DirectoryKind,
  name: string
): Promise<DirectoryItem | null> => {
  const normalizedName = normalizeNodeName(name);
  const response = await dynamoDoc.send(
    new QueryCommand({
      TableName: env.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': buildFilePk(userId, dockspaceId),
        ':skPrefix': buildDirectoryNamePrefix(parentFolderNodeId, kind, normalizedName)
      },
      Limit: 1
    })
  );

  return ((response.Items ?? [])[0] as DirectoryItem | undefined) ?? null;
};

export const findDirectoryFileByName = async (
  userId: string,
  dockspaceId: string,
  parentFolderNodeId: string,
  name: string
): Promise<DirectoryItem | null> =>
  findDirectoryEntryByNameInternal(userId, dockspaceId, parentFolderNodeId, 'L', name);

export const findDownloadableFileByNodeId = async (
  userId: string,
  dockspaceId: string,
  fileNodeId: string
): Promise<FileNodeItem | null> => {
  const fileNode = await getFileNodeById(userId, dockspaceId, fileNodeId);
  if (!fileNode) {
    return null;
  }

  if (fileStateFromNode(fileNode) === 'PURGED') {
    return null;
  }

  return fileNode;
};

const resolveFolderNodeId = async (
  userId: string,
  dockspaceId: string,
  folderPath: string
): Promise<string | null> => {
  const segments = splitFolderPath(folderPath);
  if (!segments.length) {
    return ROOT_FOLDER_NODE_ID;
  }

  let currentFolderNodeId = ROOT_FOLDER_NODE_ID;

  for (const segment of segments) {
    const nextFolder = await findDirectoryEntryByNameInternal(
      userId,
      dockspaceId,
      currentFolderNodeId,
      'F',
      segment
    );

    if (!nextFolder) {
      return null;
    }

    currentFolderNodeId = nextFolder.childId;
  }

  return currentFolderNodeId;
};

const ensureFolderNodeId = async (
  userId: string,
  dockspaceId: string,
  folderSegments: string[],
  nowIso: string
): Promise<string> => {
  await putRootFolderNodeIfMissing(userId, dockspaceId, nowIso);

  let currentFolderNodeId = ROOT_FOLDER_NODE_ID;

  for (const segment of folderSegments) {
    const existing = await findDirectoryEntryByNameInternal(
      userId,
      dockspaceId,
      currentFolderNodeId,
      'F',
      segment
    );

    if (existing) {
      currentFolderNodeId = existing.childId;
      continue;
    }

    try {
      currentFolderNodeId = await putFolderNodeWithDirectory(
        userId,
        dockspaceId,
        currentFolderNodeId,
        segment,
        nowIso
      );
    } catch (error) {
      if (!isConditionalFailure(error)) {
        throw error;
      }

      const concurrent = await findDirectoryEntryByNameInternal(
        userId,
        dockspaceId,
        currentFolderNodeId,
        'F',
        segment
      );

      if (!concurrent) {
        throw error;
      }

      currentFolderNodeId = concurrent.childId;
    }
  }

  return currentFolderNodeId;
};

export const upsertFolderByPath = async (params: {
  userId: string;
  dockspaceId: string;
  folderPath: string;
  nowIso: string;
}): Promise<{ folderNodeId: string; folderPath: string; created: boolean }> => {
  const normalizedFolderPath = normalizeFolderPath(params.folderPath);
  const existingFolderNodeId = await resolveFolderNodeId(
    params.userId,
    params.dockspaceId,
    normalizedFolderPath
  );

  if (existingFolderNodeId) {
    return {
      folderNodeId: existingFolderNodeId,
      folderPath: normalizedFolderPath,
      created: false
    };
  }

  const folderSegments = splitFolderPath(normalizedFolderPath);
  const folderNodeId = await ensureFolderNodeId(
    params.userId,
    params.dockspaceId,
    folderSegments,
    params.nowIso
  );

  return {
    folderNodeId,
    folderPath: normalizedFolderPath,
    created: true
  };
};

export const upsertActiveFileByPath = async (params: {
  userId: string;
  dockspaceId: string;
  fullPath: string;
  s3Key: string;
  preferredFileNodeId?: string;
  size: number;
  contentType: string;
  etag: string;
  nowIso: string;
}): Promise<{ fileNodeId: string; fullPath: string }> => {
  const { normalizedFullPath, folderSegments, fileName } = splitFullPath(params.fullPath);
  const parentFolderNodeId = await ensureFolderNodeId(
    params.userId,
    params.dockspaceId,
    folderSegments,
    params.nowIso
  );
  const normalizedName = normalizeNodeName(fileName);
  const existingDirectory = await findDirectoryEntryByNameInternal(
    params.userId,
    params.dockspaceId,
    parentFolderNodeId,
    'L',
    fileName
  );

  if (existingDirectory) {
    await dynamoDoc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.tableName,
              Key: {
                PK: buildFilePk(params.userId, params.dockspaceId),
                SK: buildFileNodeSk(existingDirectory.childId)
              },
              ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
              UpdateExpression:
                'SET parentFolderNodeId = :parentFolderNodeId, s3Key = :s3Key, #name = :name, #size = :size, contentType = :contentType, etag = :etag, updatedAt = :updatedAt REMOVE deletedAt, flaggedForDeleteAt, purgedAt, GSI1PK, GSI1SK',
              ExpressionAttributeNames: {
                '#name': 'name',
                '#size': 'size'
              },
              ExpressionAttributeValues: {
                ':parentFolderNodeId': parentFolderNodeId,
                ':s3Key': params.s3Key,
                ':name': fileName,
                ':size': params.size,
                ':contentType': params.contentType,
                ':etag': params.etag,
                ':updatedAt': params.nowIso
              }
            }
          },
          {
            Update: {
              TableName: env.tableName,
              Key: {
                PK: buildFilePk(params.userId, params.dockspaceId),
                SK: existingDirectory.SK
              },
              ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
              UpdateExpression:
                'SET #name = :name, normalizedName = :normalizedName, parentFolderNodeId = :parentFolderNodeId, updatedAt = :updatedAt',
              ExpressionAttributeNames: {
                '#name': 'name'
              },
              ExpressionAttributeValues: {
                ':name': fileName,
                ':normalizedName': normalizedName,
                ':parentFolderNodeId': parentFolderNodeId,
                ':updatedAt': params.nowIso
              }
            }
          }
        ]
      })
    );

    return {
      fileNodeId: existingDirectory.childId,
      fullPath: normalizedFullPath
    };
  }

  const fileNodeId = params.preferredFileNodeId ?? randomUUID();

  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: env.tableName,
            Item: {
              PK: buildFilePk(params.userId, params.dockspaceId),
              SK: buildFileNodeSk(fileNodeId),
              type: 'FILE_NODE',
              parentFolderNodeId,
              s3Key: params.s3Key,
              name: fileName,
              size: params.size,
              contentType: params.contentType,
              etag: params.etag,
              createdAt: params.nowIso,
              updatedAt: params.nowIso
            } as FileNodeItem,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
          }
        },
        {
          Put: {
            TableName: env.tableName,
            Item: {
              PK: buildFilePk(params.userId, params.dockspaceId),
              SK: buildDirectorySk(parentFolderNodeId, 'L', normalizedName, fileNodeId),
              type: 'DIRECTORY',
              name: fileName,
              normalizedName,
              childId: fileNodeId,
              childType: 'file',
              parentFolderNodeId,
              createdAt: params.nowIso,
              updatedAt: params.nowIso
            } as DirectoryItem,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
          }
        }
      ]
    })
  );

  return { fileNodeId, fullPath: normalizedFullPath };
};

export interface ResolvedFileByPath {
  fullPath: string;
  folderPath: string;
  fileNode: FileNodeItem;
  directory: DirectoryItem;
}

export interface ResolvedFolderByPath {
  folderPath: string;
  parentFolderPath: string;
  folderNode: FolderNodeItem;
  directory: DirectoryItem;
}

export const resolveFileByFullPath = async (
  userId: string,
  dockspaceId: string,
  fullPath: string
): Promise<ResolvedFileByPath | null> => {
  const { normalizedFullPath, folderPath, fileName } = splitFullPath(fullPath);
  const parentFolderNodeId = await resolveFolderNodeId(userId, dockspaceId, folderPath);

  if (!parentFolderNodeId) {
    return null;
  }

  const directory = await findDirectoryEntryByNameInternal(
    userId,
    dockspaceId,
    parentFolderNodeId,
    'L',
    fileName
  );

  if (!directory) {
    return null;
  }

  const fileNode = await getFileNodeById(userId, dockspaceId, directory.childId);

  if (!fileNode) {
    return null;
  }

  return {
    fullPath: normalizedFullPath,
    folderPath,
    fileNode,
    directory
  };
};

export const resolveFolderByPath = async (
  userId: string,
  dockspaceId: string,
  folderPath: string
): Promise<ResolvedFolderByPath | null> => {
  const normalizedFolderPath = normalizeFolderPath(folderPath);
  const segments = splitFolderPath(normalizedFolderPath);
  if (!segments.length) {
    return null;
  }

  const folderName = segments[segments.length - 1] ?? '';
  const parentFolderPath = segments.length === 1 ? '/' : `/${segments.slice(0, -1).join('/')}`;
  const parentFolderNodeId = await resolveFolderNodeId(userId, dockspaceId, parentFolderPath);
  if (!parentFolderNodeId) {
    return null;
  }

  const directory = await findDirectoryEntryByNameInternal(
    userId,
    dockspaceId,
    parentFolderNodeId,
    'F',
    folderName
  );
  if (!directory) {
    return null;
  }

  const folderNode = await getFolderNodeById(userId, dockspaceId, directory.childId);
  if (!folderNode) {
    return null;
  }

  return {
    folderPath: normalizedFolderPath,
    parentFolderPath,
    folderNode,
    directory
  };
};

export const ensureFolderNodeIdByPath = async (
  userId: string,
  dockspaceId: string,
  folderPath: string,
  nowIso: string
): Promise<string> => {
  const normalizedFolderPath = normalizeFolderPath(folderPath);
  const folderSegments = splitFolderPath(normalizedFolderPath);
  return ensureFolderNodeId(userId, dockspaceId, folderSegments, nowIso);
};

export const fullPathForTrashedFileNode = async (
  userId: string,
  dockspaceId: string,
  fileNode: FileNodeItem
): Promise<string> => {
  if (fileNode.trashedPath) {
    return normalizeFullPath(fileNode.trashedPath);
  }

  return fullPathFromFileNode(userId, dockspaceId, fileNode);
};

export const findTrashedFileByFullPath = async (
  userId: string,
  dockspaceId: string,
  fullPath: string
): Promise<FileNodeItem | null> => {
  const normalizedFullPath = normalizeFullPath(fullPath);
  const files = await listTrashedFileNodes(userId, dockspaceId);

  for (const file of files) {
    const path = await fullPathForTrashedFileNode(userId, dockspaceId, file);
    if (path === normalizedFullPath) {
      return file;
    }
  }

  return null;
};

export const listActiveFilesInFolder = async (
  userId: string,
  dockspaceId: string,
  folderPath: string
): Promise<Array<{ fullPath: string; fileNode: FileNodeItem }>> => {
  const contents = await listActiveFolderContents(userId, dockspaceId, folderPath);
  return contents.files;
};

interface RecursiveFolderTrashPlan {
  files: ResolvedFileByPath[];
  folderDirectories: DirectoryItem[];
  folderNodeIds: string[];
}

export const buildRecursiveFolderTrashPlan = async (
  userId: string,
  dockspaceId: string,
  resolvedFolder: ResolvedFolderByPath
): Promise<RecursiveFolderTrashPlan> => {
  const folderDirectories: DirectoryItem[] = [resolvedFolder.directory];
  const folderNodeIds = new Set<string>([resolvedFolder.directory.childId]);
  const files: ResolvedFileByPath[] = [];
  const foldersToVisit: Array<{ folderNodeId: string; folderPath: string }> = [
    {
      folderNodeId: resolvedFolder.directory.childId,
      folderPath: resolvedFolder.folderPath
    }
  ];

  while (foldersToVisit.length > 0) {
    const current = foldersToVisit.shift();
    if (!current) {
      continue;
    }

    const childDirectoryItems = await listDirectoryChildrenAction(
      userId,
      dockspaceId,
      current.folderNodeId
    );

    for (const directoryItem of childDirectoryItems) {
      if (directoryItem.childType === 'folder') {
        const childFolderPath = buildFullPath(current.folderPath, directoryItem.name);
        folderDirectories.push(directoryItem);
        folderNodeIds.add(directoryItem.childId);
        foldersToVisit.push({
          folderNodeId: directoryItem.childId,
          folderPath: childFolderPath
        });
        continue;
      }

      const fileNode = await getFileNodeById(userId, dockspaceId, directoryItem.childId);
      if (!fileNode || fileStateFromNode(fileNode) !== 'ACTIVE') {
        continue;
      }

      files.push({
        fullPath: buildFullPath(current.folderPath, directoryItem.name),
        folderPath: current.folderPath,
        fileNode,
        directory: directoryItem
      });
    }
  }

  return {
    files,
    folderDirectories,
    folderNodeIds: Array.from(folderNodeIds)
  };
};

export { listDirectoryChildrenByParentFolderNodeId } from './repository/folderChildren.js';

export const listActiveFolderContents = async (
  userId: string,
  dockspaceId: string,
  folderPath: string
): Promise<{
  files: Array<{ fullPath: string; fileNode: FileNodeItem }>;
  folders: Array<{
    fullPath: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  }>;
}> => {
  const normalizedFolderPath = normalizeFolderPath(folderPath);
  const folderNodeId = await resolveFolderNodeId(userId, dockspaceId, normalizedFolderPath);

  if (!folderNodeId) {
    return {
      files: [],
      folders: []
    };
  }

  const directoryItems = await listDirectoryChildrenAction(
    userId,
    dockspaceId,
    folderNodeId
  );

  const folderEntries = directoryItems
    .filter((item) => item.childType === 'folder')
    .map((directoryItem) => ({
      fullPath: buildFullPath(normalizedFolderPath, directoryItem.name),
      name: directoryItem.name,
      createdAt: directoryItem.createdAt,
      updatedAt: directoryItem.updatedAt
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const fileDirectoryItems = directoryItems.filter((item) => item.childType === 'file');
  if (!fileDirectoryItems.length) {
    return {
      files: [],
      folders: folderEntries
    };
  }

  const fileNodes = await Promise.all(
    fileDirectoryItems.map((item) => getFileNodeById(userId, dockspaceId, item.childId))
  );
  const fileNodeById = new Map(
    fileNodes
      .filter((fileNode): fileNode is FileNodeItem => Boolean(fileNode))
      .map((fileNode) => [getFileNodeIdFromSk(fileNode.SK), fileNode])
  );

  const fileEntries = fileDirectoryItems.flatMap((directoryItem) => {
    const fileNode = fileNodeById.get(directoryItem.childId);
    if (!fileNode || fileStateFromNode(fileNode) !== 'ACTIVE') {
      return [];
    }

    return [
      {
        fullPath: buildFullPath(normalizedFolderPath, directoryItem.name),
        fileNode
      }
    ];
  });

  return {
    files: fileEntries,
    folders: folderEntries
  };
};

export const markResolvedFileNodeTrashed = async (
  userId: string,
  dockspaceId: string,
  resolved: ResolvedFileByPath,
  nowIso: string,
  flaggedForDeleteAt: string
): Promise<void> => {
  const filePk = buildFilePk(userId, dockspaceId);
  const gsi1Sk = buildPurgeDueGsi1Sk(flaggedForDeleteAt, filePk, resolved.fileNode.SK);

  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: env.tableName,
            Key: {
              PK: filePk,
              SK: resolved.fileNode.SK
            },
            ConditionExpression: 'attribute_not_exists(deletedAt) AND attribute_not_exists(purgedAt)',
            UpdateExpression:
              'SET deletedAt = :deletedAt, flaggedForDeleteAt = :flaggedForDeleteAt, trashedPath = :trashedPath, updatedAt = :updatedAt, GSI1PK = :gsi1pk, GSI1SK = :gsi1sk',
            ExpressionAttributeValues: {
              ':deletedAt': nowIso,
              ':flaggedForDeleteAt': flaggedForDeleteAt,
              ':trashedPath': resolved.fullPath,
              ':updatedAt': nowIso,
              ':gsi1pk': PURGE_DUE_GSI1_PK,
              ':gsi1sk': gsi1Sk
            }
          }
        },
        {
          Delete: {
            TableName: env.tableName,
            Key: {
              PK: filePk,
              SK: resolved.directory.SK
            },
            ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)'
          }
        }
      ]
    })
  );
};

export const deleteDirectoryItems = async (
  userId: string,
  dockspaceId: string,
  directoryItems: DirectoryItem[]
): Promise<void> => {
  for (const directoryItem of directoryItems) {
    await dynamoDoc.send(
      new DeleteCommand({
        TableName: env.tableName,
        Key: {
          PK: buildFilePk(userId, dockspaceId),
          SK: directoryItem.SK
        }
      })
    );
  }
};

export const deleteFolderNodeItems = async (
  userId: string,
  dockspaceId: string,
  folderNodeIds: string[]
): Promise<void> => {
  for (const folderNodeId of folderNodeIds) {
    await dynamoDoc.send(
      new DeleteCommand({
        TableName: env.tableName,
        Key: {
          PK: buildFilePk(userId, dockspaceId),
          SK: buildFolderNodeSk(folderNodeId)
        }
      })
    );
  }
};

export const moveOrRenameActiveFileNode = async (params: {
  userId: string;
  dockspaceId: string;
  fileNode: FileNodeItem;
  oldParentFolderNodeId: string;
  oldName: string;
  newParentFolderNodeId: string;
  newName: string;
  nowIso: string;
}): Promise<void> => {
  const fileNodeId = getFileNodeIdFromSk(params.fileNode.SK);
  const oldNormalizedName = normalizeNodeName(params.oldName);
  const newNormalizedName = normalizeNodeName(params.newName);
  const oldDirectorySk = buildDirectorySk(
    params.oldParentFolderNodeId,
    'L',
    oldNormalizedName,
    fileNodeId
  );
  const newDirectorySk = buildDirectorySk(
    params.newParentFolderNodeId,
    'L',
    newNormalizedName,
    fileNodeId
  );

  if (oldDirectorySk === newDirectorySk) {
    await dynamoDoc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.tableName,
              Key: {
                PK: buildFilePk(params.userId, params.dockspaceId),
                SK: params.fileNode.SK
              },
              ConditionExpression: 'attribute_not_exists(deletedAt) AND attribute_not_exists(purgedAt)',
              UpdateExpression:
                'SET parentFolderNodeId = :parentFolderNodeId, #name = :name, updatedAt = :updatedAt',
              ExpressionAttributeNames: {
                '#name': 'name'
              },
              ExpressionAttributeValues: {
                ':parentFolderNodeId': params.newParentFolderNodeId,
                ':name': params.newName,
                ':updatedAt': params.nowIso
              }
            }
          },
          {
            Update: {
              TableName: env.tableName,
              Key: {
                PK: buildFilePk(params.userId, params.dockspaceId),
                SK: oldDirectorySk
              },
              ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
              UpdateExpression:
                'SET #name = :name, normalizedName = :normalizedName, parentFolderNodeId = :parentFolderNodeId, updatedAt = :updatedAt',
              ExpressionAttributeNames: {
                '#name': 'name'
              },
              ExpressionAttributeValues: {
                ':name': params.newName,
                ':normalizedName': newNormalizedName,
                ':parentFolderNodeId': params.newParentFolderNodeId,
                ':updatedAt': params.nowIso
              }
            }
          }
        ]
      })
    );
    return;
  }

  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: env.tableName,
            Key: {
              PK: buildFilePk(params.userId, params.dockspaceId),
              SK: params.fileNode.SK
            },
            ConditionExpression: 'attribute_not_exists(deletedAt) AND attribute_not_exists(purgedAt)',
            UpdateExpression:
              'SET parentFolderNodeId = :parentFolderNodeId, #name = :name, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
              '#name': 'name'
            },
            ExpressionAttributeValues: {
              ':parentFolderNodeId': params.newParentFolderNodeId,
              ':name': params.newName,
              ':updatedAt': params.nowIso
            }
          }
        },
        {
          Delete: {
            TableName: env.tableName,
            Key: {
              PK: buildFilePk(params.userId, params.dockspaceId),
              SK: oldDirectorySk
            }
          }
        },
        {
          Put: {
            TableName: env.tableName,
            Item: {
              PK: buildFilePk(params.userId, params.dockspaceId),
              SK: newDirectorySk,
              type: 'DIRECTORY',
              name: params.newName,
              normalizedName: newNormalizedName,
              childId: fileNodeId,
              childType: 'file',
              parentFolderNodeId: params.newParentFolderNodeId,
              createdAt: params.fileNode.createdAt,
              updatedAt: params.nowIso
            } as DirectoryItem
          }
        }
      ]
    })
  );
};

export type RenameFolderByPathResult =
  | { status: 'NOT_FOUND' }
  | { status: 'CONFLICT' }
  | { status: 'UNCHANGED'; folderPath: string }
  | { status: 'RENAMED'; folderPath: string };

export const renameFolderByPath = async (params: {
  userId: string;
  dockspaceId: string;
  folderPath: string;
  newName: string;
  nowIso: string;
}): Promise<RenameFolderByPathResult> => {
  const normalizedFolderPath = normalizeFolderPath(params.folderPath);
  const nextName = params.newName.trim();
  const folderSegments = splitFolderPath(normalizedFolderPath);

  if (!folderSegments.length) {
    return { status: 'NOT_FOUND' };
  }

  const oldName = folderSegments[folderSegments.length - 1] ?? '';
  const parentFolderPath =
    folderSegments.length === 1 ? '/' : `/${folderSegments.slice(0, -1).join('/')}`;
  const parentFolderNodeId = await resolveFolderNodeId(
    params.userId,
    params.dockspaceId,
    parentFolderPath
  );

  if (!parentFolderNodeId) {
    return { status: 'NOT_FOUND' };
  }

  const existingDirectory = await findDirectoryEntryByNameInternal(
    params.userId,
    params.dockspaceId,
    parentFolderNodeId,
    'F',
    oldName
  );

  if (!existingDirectory) {
    return { status: 'NOT_FOUND' };
  }

  const folderNodeId = existingDirectory.childId;
  const folderNode = await getFolderNodeById(params.userId, params.dockspaceId, folderNodeId);

  if (!folderNode) {
    return { status: 'NOT_FOUND' };
  }

  if (folderNode.name === nextName) {
    return {
      status: 'UNCHANGED',
      folderPath: normalizedFolderPath
    };
  }

  const conflictingFolder = await findDirectoryEntryByNameInternal(
    params.userId,
    params.dockspaceId,
    parentFolderNodeId,
    'F',
    nextName
  );

  if (conflictingFolder && conflictingFolder.childId !== folderNodeId) {
    return { status: 'CONFLICT' };
  }

  const oldDirectorySk = buildDirectorySk(
    parentFolderNodeId,
    'F',
    normalizeNodeName(oldName),
    folderNodeId
  );
  const newNormalizedName = normalizeNodeName(nextName);
  const newDirectorySk = buildDirectorySk(
    parentFolderNodeId,
    'F',
    newNormalizedName,
    folderNodeId
  );

  if (oldDirectorySk === newDirectorySk) {
    await dynamoDoc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.tableName,
              Key: {
                PK: buildFilePk(params.userId, params.dockspaceId),
                SK: folderNode.SK
              },
              ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
              UpdateExpression: 'SET #name = :name, updatedAt = :updatedAt',
              ExpressionAttributeNames: {
                '#name': 'name'
              },
              ExpressionAttributeValues: {
                ':name': nextName,
                ':updatedAt': params.nowIso
              }
            }
          },
          {
            Update: {
              TableName: env.tableName,
              Key: {
                PK: buildFilePk(params.userId, params.dockspaceId),
                SK: oldDirectorySk
              },
              ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
              UpdateExpression:
                'SET #name = :name, normalizedName = :normalizedName, updatedAt = :updatedAt',
              ExpressionAttributeNames: {
                '#name': 'name'
              },
              ExpressionAttributeValues: {
                ':name': nextName,
                ':normalizedName': newNormalizedName,
                ':updatedAt': params.nowIso
              }
            }
          }
        ]
      })
    );

    return {
      status: 'RENAMED',
      folderPath: buildFullPath(parentFolderPath, nextName)
    };
  }

  try {
    await dynamoDoc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.tableName,
              Key: {
                PK: buildFilePk(params.userId, params.dockspaceId),
                SK: folderNode.SK
              },
              ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
              UpdateExpression: 'SET #name = :name, updatedAt = :updatedAt',
              ExpressionAttributeNames: {
                '#name': 'name'
              },
              ExpressionAttributeValues: {
                ':name': nextName,
                ':updatedAt': params.nowIso
              }
            }
          },
          {
            Delete: {
              TableName: env.tableName,
              Key: {
                PK: buildFilePk(params.userId, params.dockspaceId),
                SK: oldDirectorySk
              },
              ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)'
            }
          },
          {
            Put: {
              TableName: env.tableName,
              Item: {
                PK: buildFilePk(params.userId, params.dockspaceId),
                SK: newDirectorySk,
                type: 'DIRECTORY',
                name: nextName,
                normalizedName: newNormalizedName,
                childId: folderNodeId,
                childType: 'folder',
                parentFolderNodeId,
                createdAt: existingDirectory.createdAt,
                updatedAt: params.nowIso
              } as DirectoryItem,
              ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
            }
          }
        ]
      })
    );
  } catch (error) {
    if (isConditionalFailure(error)) {
      return { status: 'CONFLICT' };
    }

    throw error;
  }

  return {
    status: 'RENAMED',
    folderPath: buildFullPath(parentFolderPath, nextName)
  };
};

export const restoreFileNodeFromTrash = async (params: {
  userId: string;
  dockspaceId: string;
  fileNode: FileNodeItem;
  parentFolderNodeId: string;
  fileName: string;
  nowIso: string;
}): Promise<void> => {
  const fileNodeId = getFileNodeIdFromSk(params.fileNode.SK);
  const normalizedName = normalizeNodeName(params.fileName);

  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: env.tableName,
            Key: {
              PK: buildFilePk(params.userId, params.dockspaceId),
              SK: params.fileNode.SK
            },
            ConditionExpression: 'attribute_exists(deletedAt) AND attribute_not_exists(purgedAt)',
            UpdateExpression:
              'SET parentFolderNodeId = :parentFolderNodeId, #name = :name, updatedAt = :updatedAt REMOVE deletedAt, flaggedForDeleteAt, purgedAt, trashedPath, GSI1PK, GSI1SK',
            ExpressionAttributeNames: {
              '#name': 'name'
            },
            ExpressionAttributeValues: {
              ':parentFolderNodeId': params.parentFolderNodeId,
              ':name': params.fileName,
              ':updatedAt': params.nowIso
            }
          }
        },
        {
          Put: {
            TableName: env.tableName,
            Item: {
              PK: buildFilePk(params.userId, params.dockspaceId),
              SK: buildDirectorySk(
                params.parentFolderNodeId,
                'L',
                normalizedName,
                fileNodeId
              ),
              type: 'DIRECTORY',
              name: params.fileName,
              normalizedName,
              childId: fileNodeId,
              childType: 'file',
              parentFolderNodeId: params.parentFolderNodeId,
              createdAt: params.fileNode.createdAt,
              updatedAt: params.nowIso
            } as DirectoryItem,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
          }
        }
      ]
    })
  );
};

export const markFileNodePurged = async (params: {
  userId: string;
  dockspaceId: string;
  fileNode: FileNodeItem;
  nowIso: string;
}): Promise<void> => {
  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: env.tableName,
            Key: {
              PK: buildFilePk(params.userId, params.dockspaceId),
              SK: params.fileNode.SK
            },
            ConditionExpression: 'attribute_exists(deletedAt) AND attribute_not_exists(purgedAt)',
            UpdateExpression: 'SET purgedAt = :purgedAt, updatedAt = :updatedAt REMOVE GSI1PK, GSI1SK',
            ExpressionAttributeValues: {
              ':purgedAt': params.nowIso,
              ':updatedAt': params.nowIso
            }
          }
        }
      ]
    })
  );
};

const listFileNodesForDockspace = async (
  userId: string,
  dockspaceId: string
): Promise<FileNodeItem[]> =>
  queryAll<FileNodeItem>({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': buildFilePk(userId, dockspaceId),
      ':skPrefix': 'L#'
    }
  });

export const listFilesByState = async (
  userId: string,
  dockspaceId: string,
  state: FileState
): Promise<FileNodeItem[]> => {
  const files = await listFileNodesForDockspace(userId, dockspaceId);

  return files.filter((file) => fileStateFromNode(file) === state);
};

export const listTrashedFileNodes = async (
  userId: string,
  dockspaceId: string
): Promise<FileNodeItem[]> => {
  const files = await listFilesByState(userId, dockspaceId, 'TRASH');
  return files.sort((a, b) =>
    (a.flaggedForDeleteAt ?? '').localeCompare(b.flaggedForDeleteAt ?? '')
  );
};

export const listPurgedFileNodes = async (
  userId: string,
  dockspaceId: string
): Promise<FileNodeItem[]> => {
  const files = await listFilesByState(userId, dockspaceId, 'PURGED');
  return files.sort((a, b) => (b.purgedAt ?? '').localeCompare(a.purgedAt ?? ''));
};

export const fullPathFromS3Key = (
  userId: string,
  dockspaceId: string,
  s3Key: string
): string => {
  const prefix = `${userId}/dockspaces/${dockspaceId}/files/`;
  if (!s3Key.startsWith(prefix)) {
    return `/${s3Key}`;
  }

  return `/${s3Key.slice(prefix.length)}`;
};

export const fullPathFromFileNode = async (
  userId: string,
  dockspaceId: string,
  fileNode: FileNodeItem
): Promise<string> => {
  if (fileNode.parentFolderNodeId === ROOT_FOLDER_NODE_ID) {
    return buildFullPath('/', fileNode.name);
  }

  const segments: string[] = [];
  const seen = new Set<string>();
  let cursor = fileNode.parentFolderNodeId;

  while (cursor && cursor !== ROOT_FOLDER_NODE_ID) {
    if (seen.has(cursor)) {
      return buildFullPath('/', fileNode.name);
    }

    seen.add(cursor);
    const folderNode = await getFolderNodeById(userId, dockspaceId, cursor);
    if (!folderNode) {
      return buildFullPath('/', fileNode.name);
    }

    segments.unshift(folderNode.name);
    cursor = folderNode.parentFolderNodeId ?? ROOT_FOLDER_NODE_ID;
  }

  const folderPath = segments.length ? `/${segments.join('/')}` : '/';
  return buildFullPath(folderPath, fileNode.name);
};
