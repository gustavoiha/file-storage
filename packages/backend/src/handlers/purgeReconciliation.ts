import type { EventBridgeEvent } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { objectExists } from '../lib/s3.js';
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

      const exists = await objectExists(item.s3Key);

      if (exists) {
        continue;
      }

      await markFileNodePurged({
        userId: partition.userId,
        dockspaceId: partition.dockspaceId,
        fileNode: item,
        nowIso: now
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
