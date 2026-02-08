import type { EventBridgeEvent } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { buildObjectKey, objectExists } from '../lib/s3.js';
import { dynamoDoc } from '../lib/clients.js';
import { env } from '../lib/env.js';
import { listFilesByState, updateFileState } from '../lib/repository.js';
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
    const trashItems = await listFilesByState(vault.userId, vault.vaultId, 'TRASH');

    for (const item of trashItems) {
      if (!item.flaggedForDeleteAt || item.flaggedForDeleteAt > now) {
        continue;
      }

      const key = buildObjectKey(vault.userId, vault.vaultId, item.fullPath.slice(1));
      const exists = await objectExists(key);

      if (!exists) {
        await updateFileState(item, 'PURGED', now);
        processed += 1;
      }
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ processed })
  };
};
