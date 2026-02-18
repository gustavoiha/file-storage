import type { EventBridgeEvent } from 'aws-lambda';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildThumbnailObjectPrefix,
  purgeObjectVersions,
  purgeObjectVersionsByPrefix
} from '../lib/s3.js';
import { dynamoDoc } from '../lib/clients.js';
import { env } from '../lib/env.js';
import { markFileNodePurged } from '../lib/repository.js';
import {
  buildPurgeDueUpperBoundGsi1Sk,
  parseDockspacePartitionSk,
  PURGE_DUE_GSI1_PK
} from '../domain/keys.js';
import type { FileNodeItem } from '../types/models.js';

export const handler = async (_event: EventBridgeEvent<string, unknown>) => {
  const now = new Date().toISOString();
  const upperBoundNow = buildPurgeDueUpperBoundGsi1Sk(now);
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  let processed = 0;

  do {
    const response = await dynamoDoc.send(
      new QueryCommand({
        TableName: env.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :gsi1pk AND GSI1SK <= :upperBoundNow',
        ExpressionAttributeValues: {
          ':gsi1pk': PURGE_DUE_GSI1_PK,
          ':upperBoundNow': upperBoundNow
        },
        ExclusiveStartKey: lastEvaluatedKey
      })
    );

    const dueItems = (response.Items ?? []) as FileNodeItem[];

    for (const item of dueItems) {
      const partition = parseDockspacePartitionSk(item.PK);
      if (!partition) {
        continue;
      }

      const latest = await dynamoDoc.send(
        new GetCommand({
          TableName: env.tableName,
          Key: {
            PK: item.PK,
            SK: item.SK
          },
          ConsistentRead: true
        })
      );

      const latestFileNode = latest.Item as FileNodeItem | undefined;
      if (
        !latestFileNode ||
        !latestFileNode.deletedAt ||
        !latestFileNode.flaggedForDeleteAt ||
        Boolean(latestFileNode.purgedAt)
      ) {
        continue;
      }

      const purgeResult = await purgeObjectVersions(latestFileNode.s3Key);
      if (purgeResult.remainingVersionCount > 0) {
        console.warn('purge-reconciliation:versions-remain', {
          s3Key: latestFileNode.s3Key,
          discoveredVersionCount: purgeResult.discoveredVersionCount,
          deletedVersionCount: purgeResult.deletedVersionCount,
          remainingVersionCount: purgeResult.remainingVersionCount
        });
        continue;
      }

      const fileNodeId = latestFileNode.SK.startsWith('L#')
        ? latestFileNode.SK.slice(2)
        : latestFileNode.SK;
      const thumbnailPrefix = buildThumbnailObjectPrefix(partition.dockspaceId, fileNodeId);
      const thumbnailPurgeResult = await purgeObjectVersionsByPrefix(
        thumbnailPrefix
      );
      if (thumbnailPurgeResult.remainingVersionCount > 0) {
        console.warn('purge-reconciliation:thumbnail-versions-remain', {
          s3Prefix: thumbnailPrefix,
          discoveredVersionCount: thumbnailPurgeResult.discoveredVersionCount,
          deletedVersionCount: thumbnailPurgeResult.deletedVersionCount,
          remainingVersionCount: thumbnailPurgeResult.remainingVersionCount
        });
        continue;
      }

      await markFileNodePurged({
        userId: partition.userId,
        dockspaceId: partition.dockspaceId,
        fileNode: latestFileNode,
        nowIso: now
      });
      console.info('purge-reconciliation:purged', {
        s3Key: latestFileNode.s3Key,
        thumbnailPrefix,
        discoveredVersionCount: purgeResult.discoveredVersionCount,
        deletedVersionCount: purgeResult.deletedVersionCount,
        discoveredThumbnailVersionCount: thumbnailPurgeResult.discoveredVersionCount,
        deletedThumbnailVersionCount: thumbnailPurgeResult.deletedVersionCount
      });
      processed += 1;
    }

    lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return {
    statusCode: 200,
    body: JSON.stringify({ processed })
  };
};
