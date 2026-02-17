import { randomUUID } from 'node:crypto';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand
} from '@aws-sdk/lib-dynamodb';
import {
  buildAlbumMembershipPrefix,
  buildAlbumMembershipSk,
  buildAlbumPrefix,
  buildAlbumSk,
  buildDirectoryNamePrefix,
  buildDirectorySk,
  buildFileNodeSk,
  buildFilePk,
  buildFileStateIndexPrefix,
  buildFileStateIndexSk,
  buildDockspaceMetricsPrefix,
  buildDockspaceMetricsSk,
  buildFolderNodeSk,
  buildDockspacePk,
  buildMediaAlbumLinkPrefix,
  buildMediaAlbumLinkSk,
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
  FileStateIndexItem,
  FolderNodeItem,
  DockspaceItem,
  DockspaceMetricsItem,
  AlbumItem,
  AlbumMembershipItem,
  MediaAlbumLinkItem
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

const buildTrashFileStateIndexSk = (
  flaggedForDeleteAt: string,
  fileNodeId: string
): string => buildFileStateIndexSk('TRASH', flaggedForDeleteAt, fileNodeId);

const buildPurgedFileStateIndexSk = (purgedAt: string, fileNodeId: string): string =>
  buildFileStateIndexSk('PURGED', purgedAt, fileNodeId);

const buildDockspaceMetricsItem = (
  userId: string,
  dockspaceId: string,
  nowIso: string
): DockspaceMetricsItem => ({
  PK: buildDockspacePk(userId),
  SK: buildDockspaceMetricsSk(dockspaceId),
  type: 'DOCKSPACE_METRICS',
  dockspaceId,
  totalFileCount: 0,
  totalSizeBytes: 0,
  updatedAt: nowIso
});

const buildDockspaceMetricsDeltaUpdate = (params: {
  userId: string;
  dockspaceId: string;
  totalFileCountDelta: number;
  totalSizeBytesDelta: number;
  nowIso: string;
  setLastUploadAt: boolean;
}) => {
  const baseSetExpression =
    '#type = if_not_exists(#type, :metricsType), dockspaceId = if_not_exists(dockspaceId, :dockspaceId), totalFileCount = if_not_exists(totalFileCount, :initialCount) + :countDelta, totalSizeBytes = if_not_exists(totalSizeBytes, :initialSize) + :sizeDelta, updatedAt = :updatedAt';

  return {
    Update: {
      TableName: env.tableName,
      Key: {
        PK: buildDockspacePk(params.userId),
        SK: buildDockspaceMetricsSk(params.dockspaceId)
      },
      UpdateExpression: `SET ${baseSetExpression}${params.setLastUploadAt ? ', lastUploadAt = :lastUploadAt' : ''}`,
      ExpressionAttributeNames: {
        '#type': 'type'
      },
      ExpressionAttributeValues: {
        ':metricsType': 'DOCKSPACE_METRICS',
        ':dockspaceId': params.dockspaceId,
        ':initialCount': params.totalFileCountDelta < 0 ? -params.totalFileCountDelta : 0,
        ':countDelta': params.totalFileCountDelta,
        ':initialSize': params.totalSizeBytesDelta < 0 ? -params.totalSizeBytesDelta : 0,
        ':sizeDelta': params.totalSizeBytesDelta,
        ':updatedAt': params.nowIso,
        ...(params.setLastUploadAt ? { ':lastUploadAt': params.nowIso } : {})
      }
    }
  };
};

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
        },
        {
          Put: {
            TableName: env.tableName,
            Item: buildDockspaceMetricsItem(dockspace.userId, dockspace.dockspaceId, nowIso),
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

export const getDockspaceById = async (
  userId: string,
  dockspaceId: string
): Promise<DockspaceItem | null> => {
  const response = await dynamoDoc.send(
    new GetCommand({
      TableName: env.tableName,
      Key: {
        PK: buildDockspacePk(userId),
        SK: `S#${dockspaceId}`
      }
    })
  );

  return (response.Item as DockspaceItem | undefined) ?? null;
};

export const listDockspaceMetrics = async (
  userId: string
): Promise<DockspaceMetricsItem[]> => {
  const response = await dynamoDoc.send(
    new QueryCommand({
      TableName: env.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': buildDockspacePk(userId),
        ':skPrefix': buildDockspaceMetricsPrefix()
      }
    })
  );

  return (response.Items ?? []) as DockspaceMetricsItem[];
};

export const findFileNodeById = async (
  userId: string,
  dockspaceId: string,
  fileNodeId: string
): Promise<FileNodeItem | null> => getFileNodeById(userId, dockspaceId, fileNodeId);

export const listFileNodes = async (
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

export const listAlbums = async (userId: string, dockspaceId: string): Promise<AlbumItem[]> => {
  const response = await dynamoDoc.send(
    new QueryCommand({
      TableName: env.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': buildFilePk(userId, dockspaceId),
        ':skPrefix': buildAlbumPrefix()
      }
    })
  );

  return (response.Items ?? []) as AlbumItem[];
};

export const getAlbumById = async (
  userId: string,
  dockspaceId: string,
  albumId: string
): Promise<AlbumItem | null> => {
  const response = await dynamoDoc.send(
    new GetCommand({
      TableName: env.tableName,
      Key: {
        PK: buildFilePk(userId, dockspaceId),
        SK: buildAlbumSk(albumId)
      }
    })
  );

  return (response.Item as AlbumItem | undefined) ?? null;
};

export const createAlbum = async (params: {
  userId: string;
  dockspaceId: string;
  albumId: string;
  name: string;
  nowIso: string;
}): Promise<AlbumItem> => {
  const item: AlbumItem = {
    PK: buildFilePk(params.userId, params.dockspaceId),
    SK: buildAlbumSk(params.albumId),
    type: 'ALBUM',
    albumId: params.albumId,
    name: params.name,
    createdAt: params.nowIso,
    updatedAt: params.nowIso
  };

  await dynamoDoc.send(
    new PutCommand({
      TableName: env.tableName,
      Item: item,
      ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
    })
  );

  return item;
};

export const renameAlbum = async (params: {
  userId: string;
  dockspaceId: string;
  albumId: string;
  name: string;
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
              SK: buildAlbumSk(params.albumId)
            },
            ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
            UpdateExpression: 'SET #name = :name, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
              '#name': 'name'
            },
            ExpressionAttributeValues: {
              ':name': params.name,
              ':updatedAt': params.nowIso
            }
          }
        }
      ]
    })
  );
};

export const listAlbumMemberships = async (
  userId: string,
  dockspaceId: string,
  albumId: string
): Promise<AlbumMembershipItem[]> => {
  const response = await dynamoDoc.send(
    new QueryCommand({
      TableName: env.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': buildFilePk(userId, dockspaceId),
        ':skPrefix': buildAlbumMembershipPrefix(albumId)
      }
    })
  );

  return (response.Items ?? []) as AlbumMembershipItem[];
};

export const listMediaAlbumLinks = async (
  userId: string,
  dockspaceId: string,
  fileNodeId: string
): Promise<MediaAlbumLinkItem[]> => {
  const response = await dynamoDoc.send(
    new QueryCommand({
      TableName: env.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': buildFilePk(userId, dockspaceId),
        ':skPrefix': buildMediaAlbumLinkPrefix(fileNodeId)
      }
    })
  );

  return (response.Items ?? []) as MediaAlbumLinkItem[];
};

export const assignMediaToAlbum = async (params: {
  userId: string;
  dockspaceId: string;
  albumId: string;
  fileNodeIds: string[];
  nowIso: string;
}): Promise<void> => {
  const pk = buildFilePk(params.userId, params.dockspaceId);
  const uniqueIds = Array.from(new Set(params.fileNodeIds));

  for (const fileNodeId of uniqueIds) {
    try {
      await dynamoDoc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: env.tableName,
                Item: {
                  PK: pk,
                  SK: buildAlbumMembershipSk(params.albumId, fileNodeId),
                  type: 'ALBUM_MEMBERSHIP',
                  albumId: params.albumId,
                  fileNodeId,
                  createdAt: params.nowIso
                } as AlbumMembershipItem,
                ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
              }
            },
            {
              Put: {
                TableName: env.tableName,
                Item: {
                  PK: pk,
                  SK: buildMediaAlbumLinkSk(fileNodeId, params.albumId),
                  type: 'MEDIA_ALBUM_LINK',
                  albumId: params.albumId,
                  fileNodeId,
                  createdAt: params.nowIso
                } as MediaAlbumLinkItem,
                ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
              }
            }
          ]
        })
      );
    } catch (error) {
      if (!isConditionalFailure(error)) {
        throw error;
      }
    }
  }
};

export const removeAlbumMembership = async (params: {
  userId: string;
  dockspaceId: string;
  albumId: string;
  fileNodeId: string;
}): Promise<void> => {
  const pk = buildFilePk(params.userId, params.dockspaceId);

  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: env.tableName,
            Key: {
              PK: pk,
              SK: buildAlbumMembershipSk(params.albumId, params.fileNodeId)
            }
          }
        },
        {
          Delete: {
            TableName: env.tableName,
            Key: {
              PK: pk,
              SK: buildMediaAlbumLinkSk(params.fileNodeId, params.albumId)
            }
          }
        }
      ]
    })
  );
};

export const removeAllAlbumMembershipsForFile = async (
  userId: string,
  dockspaceId: string,
  fileNodeId: string
): Promise<void> => {
  const pk = buildFilePk(userId, dockspaceId);
  const links = await listMediaAlbumLinks(userId, dockspaceId, fileNodeId);

  for (const link of links) {
    await dynamoDoc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: env.tableName,
              Key: {
                PK: pk,
                SK: buildMediaAlbumLinkSk(fileNodeId, link.albumId)
              }
            }
          },
          {
            Delete: {
              TableName: env.tableName,
              Key: {
                PK: pk,
                SK: buildAlbumMembershipSk(link.albumId, fileNodeId)
              }
            }
          }
        ]
      })
    );
  }
};

export const deleteAlbumAndMemberships = async (
  userId: string,
  dockspaceId: string,
  albumId: string
): Promise<void> => {
  const pk = buildFilePk(userId, dockspaceId);
  const memberships = await listAlbumMemberships(userId, dockspaceId, albumId);

  await dynamoDoc.send(
    new DeleteCommand({
      TableName: env.tableName,
      Key: {
        PK: pk,
        SK: buildAlbumSk(albumId)
      },
      ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)'
    })
  );

  for (const membership of memberships) {
    await dynamoDoc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: env.tableName,
              Key: {
                PK: pk,
                SK: buildAlbumMembershipSk(albumId, membership.fileNodeId)
              }
            }
          },
          {
            Delete: {
              TableName: env.tableName,
              Key: {
                PK: pk,
                SK: buildMediaAlbumLinkSk(membership.fileNodeId, albumId)
              }
            }
          }
        ]
      })
    );
  }
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
  const filePk = buildFilePk(params.userId, params.dockspaceId);
  const existingDirectory = await findDirectoryEntryByNameInternal(
    params.userId,
    params.dockspaceId,
    parentFolderNodeId,
    'L',
    fileName
  );

  if (existingDirectory) {
    const existingFileNode = await getFileNodeById(
      params.userId,
      params.dockspaceId,
      existingDirectory.childId
    );
    const existingSize = existingFileNode?.size ?? params.size;
    const staleStateDeletes: Array<{ Delete: { TableName: string; Key: { PK: string; SK: string } } }> =
      [];

    if (existingFileNode?.flaggedForDeleteAt) {
      staleStateDeletes.push({
        Delete: {
          TableName: env.tableName,
          Key: {
            PK: filePk,
            SK: buildTrashFileStateIndexSk(existingFileNode.flaggedForDeleteAt, existingDirectory.childId)
          }
        }
      });
    }

    if (existingFileNode?.purgedAt) {
      staleStateDeletes.push({
        Delete: {
          TableName: env.tableName,
          Key: {
            PK: filePk,
            SK: buildPurgedFileStateIndexSk(existingFileNode.purgedAt, existingDirectory.childId)
          }
        }
      });
    }

    await dynamoDoc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.tableName,
              Key: {
                PK: filePk,
                SK: buildFileNodeSk(existingDirectory.childId)
              },
              ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
              UpdateExpression:
                'SET parentFolderNodeId = :parentFolderNodeId, s3Key = :s3Key, #name = :name, #size = :size, contentType = :contentType, etag = :etag, updatedAt = :updatedAt REMOVE deletedAt, flaggedForDeleteAt, purgedAt, trashedPath, GSI1PK, GSI1SK',
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
                PK: filePk,
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
          },
          buildDockspaceMetricsDeltaUpdate({
            userId: params.userId,
            dockspaceId: params.dockspaceId,
            totalFileCountDelta: 0,
            totalSizeBytesDelta: params.size - existingSize,
            nowIso: params.nowIso,
            setLastUploadAt: true
          }),
          ...staleStateDeletes
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
              PK: filePk,
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
              PK: filePk,
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
        },
        buildDockspaceMetricsDeltaUpdate({
          userId: params.userId,
          dockspaceId: params.dockspaceId,
          totalFileCountDelta: 1,
          totalSizeBytesDelta: params.size,
          nowIso: params.nowIso,
          setLastUploadAt: true
        })
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
  const stateItems = await listTrashedFileStateIndex(userId, dockspaceId);

  for (const stateItem of stateItems) {
    if (!stateItem.trashedPath || normalizeFullPath(stateItem.trashedPath) !== normalizedFullPath) {
      continue;
    }

    const fileNode = await getFileNodeById(userId, dockspaceId, stateItem.fileNodeId);
    if (fileNode && fileStateFromNode(fileNode) === 'TRASH') {
      return fileNode;
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
  const fileNodeId = getFileNodeIdFromSk(resolved.fileNode.SK);
  const gsi1Sk = buildPurgeDueGsi1Sk(flaggedForDeleteAt, filePk, resolved.fileNode.SK);
  const trashStateIndexSk = buildTrashFileStateIndexSk(flaggedForDeleteAt, fileNodeId);

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
          Put: {
            TableName: env.tableName,
            Item: {
              PK: filePk,
              SK: trashStateIndexSk,
              type: 'FILE_STATE_INDEX',
              state: 'TRASH',
              fileNodeId,
              trashedPath: resolved.fullPath,
              size: resolved.fileNode.size,
              deletedAt: nowIso,
              flaggedForDeleteAt,
              updatedAt: nowIso
            } as FileStateIndexItem,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
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

  await removeAllAlbumMembershipsForFile(userId, dockspaceId, fileNodeId);
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

export type MoveFolderByPathResult =
  | { status: 'NOT_FOUND' }
  | { status: 'CONFLICT' }
  | { status: 'INVALID_DESTINATION' }
  | { status: 'UNCHANGED'; from: string; to: string }
  | { status: 'MOVED'; from: string; to: string };

export const moveFolderByPath = async (params: {
  userId: string;
  dockspaceId: string;
  sourceFolderPath: string;
  targetFolderPath: string;
  nowIso: string;
}): Promise<MoveFolderByPathResult> => {
  const sourceFolderPath = normalizeFolderPath(params.sourceFolderPath);
  const targetFolderPath = normalizeFolderPath(params.targetFolderPath);

  if (sourceFolderPath === '/' || sourceFolderPath === targetFolderPath) {
    return { status: 'INVALID_DESTINATION' };
  }

  const resolvedSourceFolder = await resolveFolderByPath(
    params.userId,
    params.dockspaceId,
    sourceFolderPath
  );
  if (!resolvedSourceFolder) {
    return { status: 'NOT_FOUND' };
  }

  const sourceFolderNodeId = resolvedSourceFolder.directory.childId;
  const sourceFolderNode = resolvedSourceFolder.folderNode;
  const sourceFolderName = sourceFolderNode.name;
  const sourceParentFolderNodeId = sourceFolderNode.parentFolderNodeId ?? ROOT_FOLDER_NODE_ID;

  const targetFolderNodeId =
    targetFolderPath === '/'
      ? ROOT_FOLDER_NODE_ID
      : (await resolveFolderByPath(params.userId, params.dockspaceId, targetFolderPath))?.directory
          .childId ?? null;

  if (!targetFolderNodeId) {
    return { status: 'NOT_FOUND' };
  }

  if (targetFolderNodeId === sourceFolderNodeId) {
    return { status: 'INVALID_DESTINATION' };
  }

  if (sourceParentFolderNodeId === targetFolderNodeId) {
    return {
      status: 'UNCHANGED',
      from: sourceFolderPath,
      to: sourceFolderPath
    };
  }

  const visitedFolderNodeIds = new Set<string>();
  let cursorFolderNodeId = targetFolderNodeId;
  while (cursorFolderNodeId !== ROOT_FOLDER_NODE_ID) {
    if (visitedFolderNodeIds.has(cursorFolderNodeId)) {
      return { status: 'INVALID_DESTINATION' };
    }

    if (cursorFolderNodeId === sourceFolderNodeId) {
      return { status: 'INVALID_DESTINATION' };
    }

    visitedFolderNodeIds.add(cursorFolderNodeId);
    const cursorFolderNode = await getFolderNodeById(
      params.userId,
      params.dockspaceId,
      cursorFolderNodeId
    );
    if (!cursorFolderNode) {
      return { status: 'NOT_FOUND' };
    }

    cursorFolderNodeId = cursorFolderNode.parentFolderNodeId ?? ROOT_FOLDER_NODE_ID;
  }

  const conflictingFolder = await findDirectoryEntryByNameInternal(
    params.userId,
    params.dockspaceId,
    targetFolderNodeId,
    'F',
    sourceFolderName
  );
  if (conflictingFolder && conflictingFolder.childId !== sourceFolderNodeId) {
    return { status: 'CONFLICT' };
  }

  const oldDirectorySk = resolvedSourceFolder.directory.SK;
  const newDirectorySk = buildDirectorySk(
    targetFolderNodeId,
    'F',
    normalizeNodeName(sourceFolderName),
    sourceFolderNodeId
  );

  try {
    await dynamoDoc.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: env.tableName,
              Key: {
                PK: buildFilePk(params.userId, params.dockspaceId),
                SK: sourceFolderNode.SK
              },
              ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
              UpdateExpression: 'SET parentFolderNodeId = :parentFolderNodeId, updatedAt = :updatedAt',
              ExpressionAttributeValues: {
                ':parentFolderNodeId': targetFolderNodeId,
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
                name: sourceFolderName,
                normalizedName: normalizeNodeName(sourceFolderName),
                childId: sourceFolderNodeId,
                childType: 'folder',
                parentFolderNodeId: targetFolderNodeId,
                createdAt: resolvedSourceFolder.directory.createdAt,
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
    status: 'MOVED',
    from: sourceFolderPath,
    to: buildFullPath(targetFolderPath, sourceFolderName)
  };
};

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
  const filePk = buildFilePk(params.userId, params.dockspaceId);
  const normalizedName = normalizeNodeName(params.fileName);
  const trashStateIndexSk = params.fileNode.flaggedForDeleteAt
    ? buildTrashFileStateIndexSk(params.fileNode.flaggedForDeleteAt, fileNodeId)
    : null;
  const stateIndexDeleteItems: Array<{ Delete: { TableName: string; Key: { PK: string; SK: string } } }> =
    [];

  if (trashStateIndexSk) {
    stateIndexDeleteItems.push({
      Delete: {
        TableName: env.tableName,
        Key: {
          PK: filePk,
          SK: trashStateIndexSk
        }
      }
    });
  }

  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: env.tableName,
            Key: {
              PK: filePk,
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
              PK: filePk,
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
        },
        ...stateIndexDeleteItems
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
  const filePk = buildFilePk(params.userId, params.dockspaceId);
  const fileNodeId = getFileNodeIdFromSk(params.fileNode.SK);
  const trashStateIndexSk = params.fileNode.flaggedForDeleteAt
    ? buildTrashFileStateIndexSk(params.fileNode.flaggedForDeleteAt, fileNodeId)
    : null;
  const purgedStateIndexSk = buildPurgedFileStateIndexSk(params.nowIso, fileNodeId);

  await dynamoDoc.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: env.tableName,
            Key: {
              PK: filePk,
              SK: params.fileNode.SK
            },
            ConditionExpression: 'attribute_exists(deletedAt) AND attribute_not_exists(purgedAt)',
            UpdateExpression: 'SET purgedAt = :purgedAt, updatedAt = :updatedAt REMOVE GSI1PK, GSI1SK',
            ExpressionAttributeValues: {
              ':purgedAt': params.nowIso,
              ':updatedAt': params.nowIso
            }
          }
        },
        buildDockspaceMetricsDeltaUpdate({
          userId: params.userId,
          dockspaceId: params.dockspaceId,
          totalFileCountDelta: -1,
          totalSizeBytesDelta: -params.fileNode.size,
          nowIso: params.nowIso,
          setLastUploadAt: false
        }),
        {
          Put: {
            TableName: env.tableName,
            Item: {
              PK: filePk,
              SK: purgedStateIndexSk,
              type: 'FILE_STATE_INDEX',
              state: 'PURGED',
              fileNodeId,
              trashedPath: params.fileNode.trashedPath,
              purgedAt: params.nowIso,
              updatedAt: params.nowIso
            } as FileStateIndexItem,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
          }
        },
        ...(trashStateIndexSk
          ? [
              {
                Delete: {
                  TableName: env.tableName,
                  Key: {
                    PK: filePk,
                    SK: trashStateIndexSk
                  }
                }
              }
            ]
          : [])
      ]
    })
  );

  await removeAllAlbumMembershipsForFile(params.userId, params.dockspaceId, fileNodeId);
};

export const listTrashedFileStateIndex = async (
  userId: string,
  dockspaceId: string
): Promise<FileStateIndexItem[]> =>
  queryAll<FileStateIndexItem>({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': buildFilePk(userId, dockspaceId),
      ':skPrefix': buildFileStateIndexPrefix('TRASH')
    }
  });

export const listPurgedFileStateIndex = async (
  userId: string,
  dockspaceId: string
): Promise<FileStateIndexItem[]> =>
  queryAll<FileStateIndexItem>({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': buildFilePk(userId, dockspaceId),
      ':skPrefix': buildFileStateIndexPrefix('PURGED')
    },
    ScanIndexForward: false
  });

export const listTrashedFileNodes = async (
  userId: string,
  dockspaceId: string
): Promise<FileNodeItem[]> => {
  const stateItems = await listTrashedFileStateIndex(userId, dockspaceId);
  if (!stateItems.length) {
    return [];
  }

  const fileNodes = await Promise.all(
    stateItems.map((item) => getFileNodeById(userId, dockspaceId, item.fileNodeId))
  );

  return fileNodes.filter(
    (fileNode): fileNode is FileNodeItem => {
      if (!fileNode) {
        return false;
      }

      return fileStateFromNode(fileNode) === 'TRASH';
    }
  );
};

export const listPurgedFileNodes = async (
  userId: string,
  dockspaceId: string
): Promise<FileNodeItem[]> => {
  const stateItems = await listPurgedFileStateIndex(userId, dockspaceId);
  if (!stateItems.length) {
    return [];
  }

  const fileNodes = await Promise.all(
    stateItems.map((item) => getFileNodeById(userId, dockspaceId, item.fileNodeId))
  );

  return fileNodes.filter(
    (fileNode): fileNode is FileNodeItem => {
      if (!fileNode) {
        return false;
      }

      return fileStateFromNode(fileNode) === 'PURGED';
    }
  );
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
