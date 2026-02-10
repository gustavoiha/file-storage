import { randomUUID } from 'node:crypto';
import {
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
  buildVaultPk,
  ROOT_FOLDER_NODE_ID,
  type DirectoryKind
} from '../domain/keys.js';
import {
  buildFullPath,
  normalizeFolderPath,
  normalizeNodeName,
  normalizeFullPath,
  splitFolderPath,
  splitFullPath,
  toRelativePath
} from '../domain/path.js';
import type {
  DirectoryItem,
  FileNodeItem,
  FileState,
  FolderNodeItem,
  VaultItem
} from '../types/models.js';
import { fileStateFromNode } from '../types/models.js';
import { dynamoDoc } from './clients.js';
import { env } from './env.js';
import { listDirectoryChildrenByParentFolderNodeId as listDirectoryChildrenAction } from './repository/folderChildren.js';
import { buildObjectKey } from './s3.js';

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
  vaultId: string,
  fileNodeId: string
): Promise<FileNodeItem | null> => {
  const response = await dynamoDoc.send(
    new GetCommand({
      TableName: env.tableName,
      Key: {
        PK: buildFilePk(userId, vaultId),
        SK: buildFileNodeSk(fileNodeId)
      }
    })
  );

  return (response.Item as FileNodeItem | undefined) ?? null;
};

const putRootFolderNodeIfMissing = async (
  userId: string,
  vaultId: string,
  nowIso: string
): Promise<void> => {
  try {
    await dynamoDoc.send(
      new PutCommand({
        TableName: env.tableName,
        Item: {
          PK: buildFilePk(userId, vaultId),
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
  vaultId: string,
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
              PK: buildFilePk(userId, vaultId),
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
              PK: buildFilePk(userId, vaultId),
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

export const putVault = async (vault: VaultItem): Promise<void> => {
  await dynamoDoc.send(
    new PutCommand({
      TableName: env.tableName,
      Item: vault
    })
  );
};

export const putVaultWithRootFolder = async (
  vault: VaultItem,
  nowIso: string
): Promise<void> => {
  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: env.tableName,
            Item: vault,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
          }
        },
        {
          Put: {
            TableName: env.tableName,
            Item: {
              PK: buildFilePk(vault.userId, vault.vaultId),
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

export const listVaults = async (userId: string): Promise<VaultItem[]> => {
  const response = await dynamoDoc.send(
    new QueryCommand({
      TableName: env.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': buildVaultPk(userId),
        ':skPrefix': 'V#'
      }
    })
  );

  return (response.Items ?? []) as VaultItem[];
};

const findDirectoryEntryByNameInternal = async (
  userId: string,
  vaultId: string,
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
        ':pk': buildFilePk(userId, vaultId),
        ':skPrefix': buildDirectoryNamePrefix(parentFolderNodeId, kind, normalizedName)
      },
      Limit: 1
    })
  );

  return ((response.Items ?? [])[0] as DirectoryItem | undefined) ?? null;
};

export const findDirectoryFileByName = async (
  userId: string,
  vaultId: string,
  parentFolderNodeId: string,
  name: string
): Promise<DirectoryItem | null> =>
  findDirectoryEntryByNameInternal(userId, vaultId, parentFolderNodeId, 'L', name);

const resolveFolderNodeId = async (
  userId: string,
  vaultId: string,
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
      vaultId,
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
  vaultId: string,
  folderSegments: string[],
  nowIso: string
): Promise<string> => {
  await putRootFolderNodeIfMissing(userId, vaultId, nowIso);

  let currentFolderNodeId = ROOT_FOLDER_NODE_ID;

  for (const segment of folderSegments) {
    const existing = await findDirectoryEntryByNameInternal(
      userId,
      vaultId,
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
        vaultId,
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
        vaultId,
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
  vaultId: string;
  folderPath: string;
  nowIso: string;
}): Promise<{ folderNodeId: string; folderPath: string; created: boolean }> => {
  const normalizedFolderPath = normalizeFolderPath(params.folderPath);
  const existingFolderNodeId = await resolveFolderNodeId(
    params.userId,
    params.vaultId,
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
    params.vaultId,
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
  vaultId: string;
  fullPath: string;
  s3Key: string;
  size: number;
  contentType: string;
  etag: string;
  nowIso: string;
}): Promise<{ fileNodeId: string; fullPath: string }> => {
  const { normalizedFullPath, folderSegments, fileName } = splitFullPath(params.fullPath);
  const parentFolderNodeId = await ensureFolderNodeId(
    params.userId,
    params.vaultId,
    folderSegments,
    params.nowIso
  );
  const normalizedName = normalizeNodeName(fileName);
  const existingDirectory = await findDirectoryEntryByNameInternal(
    params.userId,
    params.vaultId,
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
                PK: buildFilePk(params.userId, params.vaultId),
                SK: buildFileNodeSk(existingDirectory.childId)
              },
              ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
              UpdateExpression:
                'SET parentFolderNodeId = :parentFolderNodeId, s3Key = :s3Key, #name = :name, #size = :size, contentType = :contentType, etag = :etag, updatedAt = :updatedAt REMOVE deletedAt, flaggedForDeleteAt, purgedAt',
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
                PK: buildFilePk(params.userId, params.vaultId),
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

  const fileNodeId = randomUUID();

  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: env.tableName,
            Item: {
              PK: buildFilePk(params.userId, params.vaultId),
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
              PK: buildFilePk(params.userId, params.vaultId),
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

export const resolveFileByFullPath = async (
  userId: string,
  vaultId: string,
  fullPath: string
): Promise<ResolvedFileByPath | null> => {
  const { normalizedFullPath, folderPath, fileName } = splitFullPath(fullPath);
  const parentFolderNodeId = await resolveFolderNodeId(userId, vaultId, folderPath);

  if (!parentFolderNodeId) {
    return null;
  }

  const directory = await findDirectoryEntryByNameInternal(
    userId,
    vaultId,
    parentFolderNodeId,
    'L',
    fileName
  );

  if (!directory) {
    return null;
  }

  const fileNode = await getFileNodeById(userId, vaultId, directory.childId);

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

export const findTrashedFileByFullPath = async (
  userId: string,
  vaultId: string,
  fullPath: string
): Promise<FileNodeItem | null> => {
  const normalizedFullPath = normalizeFullPath(fullPath);
  const s3Key = buildObjectKey(userId, vaultId, toRelativePath(normalizedFullPath));

  const files = await queryAll<FileNodeItem>({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    FilterExpression:
      's3Key = :s3Key AND attribute_exists(deletedAt) AND attribute_not_exists(purgedAt)',
    ExpressionAttributeValues: {
      ':pk': buildFilePk(userId, vaultId),
      ':skPrefix': 'L#',
      ':s3Key': s3Key
    }
  });

  files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return files[0] ?? null;
};

export const listActiveFilesInFolder = async (
  userId: string,
  vaultId: string,
  folderPath: string
): Promise<Array<{ fullPath: string; fileNode: FileNodeItem }>> => {
  const contents = await listActiveFolderContents(userId, vaultId, folderPath);
  return contents.files;
};

export { listDirectoryChildrenByParentFolderNodeId } from './repository/folderChildren.js';

export const listActiveFolderContents = async (
  userId: string,
  vaultId: string,
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
  const folderNodeId = await resolveFolderNodeId(userId, vaultId, normalizedFolderPath);

  if (!folderNodeId) {
    return {
      files: [],
      folders: []
    };
  }

  const directoryItems = await listDirectoryChildrenAction(
    userId,
    vaultId,
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
    fileDirectoryItems.map((item) => getFileNodeById(userId, vaultId, item.childId))
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
  vaultId: string,
  resolved: ResolvedFileByPath,
  nowIso: string,
  flaggedForDeleteAt: string
): Promise<void> => {
  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: env.tableName,
            Key: {
              PK: buildFilePk(userId, vaultId),
              SK: resolved.fileNode.SK
            },
            ConditionExpression: 'attribute_not_exists(deletedAt) AND attribute_not_exists(purgedAt)',
            UpdateExpression:
              'SET deletedAt = :deletedAt, flaggedForDeleteAt = :flaggedForDeleteAt, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
              ':deletedAt': nowIso,
              ':flaggedForDeleteAt': flaggedForDeleteAt,
              ':updatedAt': nowIso
            }
          }
        },
        {
          Delete: {
            TableName: env.tableName,
            Key: {
              PK: buildFilePk(userId, vaultId),
              SK: resolved.directory.SK
            },
            ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)'
          }
        }
      ]
    })
  );
};

export const moveOrRenameActiveFileNode = async (params: {
  userId: string;
  vaultId: string;
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

  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: env.tableName,
            Key: {
              PK: buildFilePk(params.userId, params.vaultId),
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
              PK: buildFilePk(params.userId, params.vaultId),
              SK: buildDirectorySk(
                params.oldParentFolderNodeId,
                'L',
                oldNormalizedName,
                fileNodeId
              )
            }
          }
        },
        {
          Put: {
            TableName: env.tableName,
            Item: {
              PK: buildFilePk(params.userId, params.vaultId),
              SK: buildDirectorySk(
                params.newParentFolderNodeId,
                'L',
                newNormalizedName,
                fileNodeId
              ),
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

export const restoreFileNodeFromTrash = async (params: {
  userId: string;
  vaultId: string;
  fileNode: FileNodeItem;
  nowIso: string;
}): Promise<void> => {
  const fileNodeId = getFileNodeIdFromSk(params.fileNode.SK);
  const normalizedName = normalizeNodeName(params.fileNode.name);

  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: env.tableName,
            Key: {
              PK: buildFilePk(params.userId, params.vaultId),
              SK: params.fileNode.SK
            },
            ConditionExpression: 'attribute_exists(deletedAt) AND attribute_not_exists(purgedAt)',
            UpdateExpression: 'SET updatedAt = :updatedAt REMOVE deletedAt, flaggedForDeleteAt, purgedAt',
            ExpressionAttributeValues: {
              ':updatedAt': params.nowIso
            }
          }
        },
        {
          Put: {
            TableName: env.tableName,
            Item: {
              PK: buildFilePk(params.userId, params.vaultId),
              SK: buildDirectorySk(
                params.fileNode.parentFolderNodeId,
                'L',
                normalizedName,
                fileNodeId
              ),
              type: 'DIRECTORY',
              name: params.fileNode.name,
              normalizedName,
              childId: fileNodeId,
              childType: 'file',
              parentFolderNodeId: params.fileNode.parentFolderNodeId,
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
  vaultId: string;
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
              PK: buildFilePk(params.userId, params.vaultId),
              SK: params.fileNode.SK
            },
            ConditionExpression: 'attribute_exists(deletedAt) AND attribute_not_exists(purgedAt)',
            UpdateExpression: 'SET purgedAt = :purgedAt, updatedAt = :updatedAt',
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

const listFileNodesForVault = async (
  userId: string,
  vaultId: string
): Promise<FileNodeItem[]> =>
  queryAll<FileNodeItem>({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': buildFilePk(userId, vaultId),
      ':skPrefix': 'L#'
    }
  });

export const listFilesByState = async (
  userId: string,
  vaultId: string,
  state: FileState
): Promise<FileNodeItem[]> => {
  const files = await listFileNodesForVault(userId, vaultId);

  return files.filter((file) => fileStateFromNode(file) === state);
};

export const listTrashedFileNodes = async (
  userId: string,
  vaultId: string
): Promise<FileNodeItem[]> => {
  const files = await listFilesByState(userId, vaultId, 'TRASH');
  return files.sort((a, b) =>
    (a.flaggedForDeleteAt ?? '').localeCompare(b.flaggedForDeleteAt ?? '')
  );
};

export const listPurgedFileNodes = async (
  userId: string,
  vaultId: string
): Promise<FileNodeItem[]> => {
  const files = await listFilesByState(userId, vaultId, 'PURGED');
  return files.sort((a, b) => (b.purgedAt ?? '').localeCompare(a.purgedAt ?? ''));
};

export const fullPathFromS3Key = (
  userId: string,
  vaultId: string,
  s3Key: string
): string => {
  const prefix = `${userId}/vaults/${vaultId}/files/`;
  if (!s3Key.startsWith(prefix)) {
    return `/${s3Key}`;
  }

  return `/${s3Key.slice(prefix.length)}`;
};
