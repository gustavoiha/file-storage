import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from '@aws-sdk/lib-dynamodb';
import type { FileItem, FileState, VaultItem } from '../types/models.js';
import {
  buildFilePk,
  buildFileSk,
  buildGsi1Pk,
  buildGsi1Sk,
  buildVaultPk,
  buildVaultSk
} from '../domain/keys.js';
import { dynamoDoc } from './clients.js';
import { env } from './env.js';

export const putVault = async (vault: VaultItem): Promise<void> => {
  await dynamoDoc.send(
    new PutCommand({
      TableName: env.tableName,
      Item: vault
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
        ':skPrefix': 'VAULT#'
      }
    })
  );

  return (response.Items ?? []) as VaultItem[];
};

export const putFile = async (file: FileItem): Promise<void> => {
  await dynamoDoc.send(
    new PutCommand({
      TableName: env.tableName,
      Item: file
    })
  );
};

export const getFile = async (
  userId: string,
  vaultId: string,
  fullPath: string
): Promise<FileItem | null> => {
  const response = await dynamoDoc.send(
    new GetCommand({
      TableName: env.tableName,
      Key: {
        PK: buildFilePk(userId, vaultId),
        SK: buildFileSk(fullPath)
      }
    })
  );

  return (response.Item as FileItem | undefined) ?? null;
};

export const listFilesByState = async (
  userId: string,
  vaultId: string,
  state: FileState,
  pathPrefix?: string
): Promise<FileItem[]> => {
  const basePrefix = state === 'TRASH' ? 'S#TRASH#' : `S#${state}#P#`;
  const statePrefix =
    state === 'ACTIVE' && pathPrefix
      ? `${basePrefix}${pathPrefix}`
      : state === 'PURGED' && pathPrefix
        ? `${basePrefix}${pathPrefix}`
        : basePrefix;

  const response = await dynamoDoc.send(
    new QueryCommand({
      TableName: env.tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gsiPk AND begins_with(GSI1SK, :gsiSk)',
      ExpressionAttributeValues: {
        ':gsiPk': buildGsi1Pk(userId, vaultId),
        ':gsiSk': statePrefix
      }
    })
  );

  return (response.Items ?? []) as FileItem[];
};

export const updateFileState = async (
  file: FileItem,
  state: FileState,
  nowIso: string,
  flaggedForDeleteAt?: string
): Promise<void> => {
  const keys = {
    PK: buildFilePk(file.userId, file.vaultId),
    SK: buildFileSk(file.fullPath)
  };

  const commonValues: Record<string, string> = {
    ':state': state,
    ':updatedAt': nowIso,
    ':gsi1sk': buildGsi1Sk(state, file.fullPath, flaggedForDeleteAt)
  };

  if (state === 'TRASH' && flaggedForDeleteAt) {
    await dynamoDoc.send(
      new UpdateCommand({
        TableName: env.tableName,
        Key: keys,
        ConditionExpression: '#state = :currentState',
        UpdateExpression:
          'SET #state = :state, updatedAt = :updatedAt, deletedAt = :deletedAt, flaggedForDeleteAt = :flaggedForDeleteAt, GSI1SK = :gsi1sk',
        ExpressionAttributeNames: {
          '#state': 'state'
        },
        ExpressionAttributeValues: {
          ...commonValues,
          ':currentState': 'ACTIVE',
          ':deletedAt': nowIso,
          ':flaggedForDeleteAt': flaggedForDeleteAt
        }
      })
    );

    return;
  }

  if (state === 'ACTIVE') {
    await dynamoDoc.send(
      new UpdateCommand({
        TableName: env.tableName,
        Key: keys,
        ConditionExpression: '#state = :currentState',
        UpdateExpression:
          'SET #state = :state, updatedAt = :updatedAt, GSI1SK = :gsi1sk REMOVE deletedAt, flaggedForDeleteAt, purgedAt',
        ExpressionAttributeNames: {
          '#state': 'state'
        },
        ExpressionAttributeValues: {
          ...commonValues,
          ':currentState': 'TRASH'
        }
      })
    );

    return;
  }

  await dynamoDoc.send(
    new UpdateCommand({
      TableName: env.tableName,
      Key: keys,
      ConditionExpression: '#state = :currentState',
      UpdateExpression:
        'SET #state = :state, updatedAt = :updatedAt, purgedAt = :purgedAt, GSI1SK = :gsi1sk',
      ExpressionAttributeNames: {
        '#state': 'state'
      },
      ExpressionAttributeValues: {
        ...commonValues,
        ':currentState': 'TRASH',
        ':purgedAt': nowIso
      }
    })
  );
};

export const deleteFileMetadata = async (
  userId: string,
  vaultId: string,
  fullPath: string
): Promise<void> => {
  await dynamoDoc.send(
    new DeleteCommand({
      TableName: env.tableName,
      Key: {
        PK: buildFilePk(userId, vaultId),
        SK: buildFileSk(fullPath)
      }
    })
  );
};
