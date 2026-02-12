import type { EventBridgeEvent } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { objectExists } from '../lib/s3.js';
import { dynamoDoc } from '../lib/clients.js';
import { env } from '../lib/env.js';
import { listTrashedFileNodes, markFileNodePurged } from '../lib/repository.js';
import type { DockspaceItem } from '../types/models.js';

export const handler = async (_event: EventBridgeEvent<string, unknown>) => {
  const now = new Date().toISOString();

  const dockspaceScan = await dynamoDoc.send(
    new ScanCommand({
      TableName: env.tableName,
      FilterExpression: '#type = :dockspaceType',
      ExpressionAttributeNames: {
        '#type': 'type'
      },
      ExpressionAttributeValues: {
        ':dockspaceType': 'DOCKSPACE'
      }
    })
  );

  const dockspaces = (dockspaceScan.Items ?? []) as DockspaceItem[];
  let processed = 0;

  for (const dockspace of dockspaces) {
    const trashItems = await listTrashedFileNodes(dockspace.userId, dockspace.dockspaceId);

    for (const item of trashItems) {
      if (!item.flaggedForDeleteAt || item.flaggedForDeleteAt > now) {
        continue;
      }

      const exists = await objectExists(item.s3Key);

      if (!exists) {
        await markFileNodePurged({
          userId: dockspace.userId,
          dockspaceId: dockspace.dockspaceId,
          fileNode: item,
          nowIso: now
        });
        processed += 1;
      }
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ processed })
  };
};
