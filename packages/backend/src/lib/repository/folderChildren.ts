import { BatchGetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { buildDirectoryPrefix, buildFileNodeSk, buildFilePk } from '../../domain/keys.js';
import type { DirectoryItem } from '../../types/models.js';
import { dynamoDoc } from '../clients.js';
import { env } from '../env.js';

/** DynamoDB BatchGetItem accepts at most 100 keys per request. */
const BATCH_GET_MAX_KEYS = 100;
const BATCH_GET_MAX_ATTEMPTS = 5;

export const listDirectoryChildrenByParentFolderNodeId = async (
  userId: string,
  dockspaceId: string,
  parentFolderNodeId: string
): Promise<DirectoryItem[]> => {
  const response = await dynamoDoc.send(
    new QueryCommand({
      TableName: env.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': buildFilePk(userId, dockspaceId),
        ':skPrefix': buildDirectoryPrefix(parentFolderNodeId)
      }
    })
  );

  return (response.Items ?? []) as DirectoryItem[];
};

/**
 * Reads the stored size (in bytes) of each given file node. File nodes that are missing, or
 * that have no numeric size stored, are left out of the result.
 */
export const getFileNodeSizesByIds = async (
  userId: string,
  dockspaceId: string,
  fileNodeIds: readonly string[]
): Promise<Map<string, number>> => {
  const sizes = new Map<string, number>();
  const uniqueIds = [...new Set(fileNodeIds)];
  if (!uniqueIds.length) {
    return sizes;
  }

  const pk = buildFilePk(userId, dockspaceId);
  const fileNodeIdBySk = new Map(uniqueIds.map((id) => [buildFileNodeSk(id), id]));

  for (let start = 0; start < uniqueIds.length; start += BATCH_GET_MAX_KEYS) {
    let keys: Record<string, unknown>[] = uniqueIds
      .slice(start, start + BATCH_GET_MAX_KEYS)
      .map((id) => ({ PK: pk, SK: buildFileNodeSk(id) }));

    for (let attempt = 0; keys.length && attempt < BATCH_GET_MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        // Back off before retrying keys DynamoDB left unprocessed (throttling).
        await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
      }

      const response = await dynamoDoc.send(
        new BatchGetCommand({
          RequestItems: {
            [env.tableName]: {
              Keys: keys,
              ProjectionExpression: 'SK, #size',
              ExpressionAttributeNames: { '#size': 'size' }
            }
          }
        })
      );

      for (const item of response.Responses?.[env.tableName] ?? []) {
        const fileNodeId = fileNodeIdBySk.get(String(item.SK));
        if (fileNodeId && typeof item.size === 'number' && Number.isFinite(item.size)) {
          sizes.set(fileNodeId, item.size);
        }
      }

      keys = (response.UnprocessedKeys?.[env.tableName]?.Keys ?? []) as Record<string, unknown>[];
    }
  }

  return sizes;
};
