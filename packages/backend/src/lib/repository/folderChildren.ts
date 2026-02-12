import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { buildDirectoryPrefix, buildFilePk } from '../../domain/keys.js';
import type { DirectoryItem } from '../../types/models.js';
import { dynamoDoc } from '../clients.js';
import { env } from '../env.js';

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
