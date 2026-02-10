import type { EventBridgeEvent } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { objectExists } from '../lib/s3.js';
import { dynamoDoc } from '../lib/clients.js';
import { env } from '../lib/env.js';
import { listTrashedFileNodes, markFileNodePurged } from '../lib/repository.js';
import type { VaultItem } from '../types/models.js';

export const handler = async (_event: EventBridgeEvent<string, unknown>) => {
  const now = new Date().toISOString();

  const vaultScan = await dynamoDoc.send(
    new ScanCommand({
      TableName: env.tableName,
      FilterExpression: '#type = :vaultType',
      ExpressionAttributeNames: {
        '#type': 'type'
      },
      ExpressionAttributeValues: {
        ':vaultType': 'VAULT'
      }
    })
  );

  const vaults = (vaultScan.Items ?? []) as VaultItem[];
  let processed = 0;

  for (const vault of vaults) {
    const trashItems = await listTrashedFileNodes(vault.userId, vault.vaultId);

    for (const item of trashItems) {
      if (!item.flaggedForDeleteAt || item.flaggedForDeleteAt > now) {
        continue;
      }

      const exists = await objectExists(item.s3Key);

      if (!exists) {
        await markFileNodePurged({
          userId: vault.userId,
          vaultId: vault.vaultId,
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
