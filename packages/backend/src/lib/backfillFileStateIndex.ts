import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { buildFileStateIndexSk } from '../domain/keys.js';
import { dynamoDoc } from './clients.js';
import type { FileNodeItem, FileStateIndexItem } from '../types/models.js';

const isConditionalFailure = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === 'ConditionalCheckFailedException' ||
    error.name === 'TransactionCanceledException');

const requiredTableName = (): string => {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('Missing required env var: TABLE_NAME');
  }

  return tableName;
};

export interface BackfillFileStateIndexOptions {
  dryRun?: boolean;
  pageSize?: number;
  maxPages?: number;
}

export interface BackfillFileStateIndexResult {
  dryRun: boolean;
  pageSize: number;
  pageCount: number;
  scannedCount: number;
  eligibleTrashCount: number;
  eligiblePurgedCount: number;
  skippedIneligibleCount: number;
  createdCount: number;
  dryRunCreateCount: number;
  alreadyExistsCount: number;
}

type IndexTargetState =
  | {
      state: 'TRASH';
      timestampIso: string;
      fileNodeId: string;
    }
  | {
      state: 'PURGED';
      timestampIso: string;
      fileNodeId: string;
    };

const parseFileNodeIdFromSk = (sk: string | undefined): string | null => {
  if (!sk?.startsWith('L#')) {
    return null;
  }

  const fileNodeId = sk.slice(2);
  return fileNodeId ? fileNodeId : null;
};

const resolveIndexTargetState = (item: Partial<FileNodeItem>): IndexTargetState | null => {
  const fileNodeId = parseFileNodeIdFromSk(item.SK);
  if (!fileNodeId) {
    return null;
  }

  if (item.purgedAt) {
    return {
      state: 'PURGED',
      timestampIso: item.purgedAt,
      fileNodeId
    };
  }

  if (item.deletedAt && item.flaggedForDeleteAt) {
    return {
      state: 'TRASH',
      timestampIso: item.flaggedForDeleteAt,
      fileNodeId
    };
  }

  return null;
};

export const backfillFileStateIndex = async (
  options: BackfillFileStateIndexOptions = {}
): Promise<BackfillFileStateIndexResult> => {
  const dryRun = options.dryRun ?? true;
  const pageSize = options.pageSize ?? 200;
  const tableName = requiredTableName();

  let exclusiveStartKey: Record<string, unknown> | undefined;
  let pageCount = 0;
  let scannedCount = 0;
  let eligibleTrashCount = 0;
  let eligiblePurgedCount = 0;
  let skippedIneligibleCount = 0;
  let createdCount = 0;
  let dryRunCreateCount = 0;
  let alreadyExistsCount = 0;

  do {
    const page = await dynamoDoc.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression:
          'PK, SK, #type, #name, #size, deletedAt, flaggedForDeleteAt, purgedAt, trashedPath, updatedAt',
        FilterExpression:
          '#type = :fileNodeType AND (attribute_exists(purgedAt) OR (attribute_exists(deletedAt) AND attribute_exists(flaggedForDeleteAt)))',
        ExpressionAttributeNames: {
          '#type': 'type',
          '#name': 'name',
          '#size': 'size'
        },
        ExpressionAttributeValues: {
          ':fileNodeType': 'FILE_NODE'
        },
        ExclusiveStartKey: exclusiveStartKey,
        Limit: pageSize
      })
    );

    pageCount += 1;

    const items = (page.Items ?? []) as Partial<FileNodeItem>[];
    scannedCount += items.length;

    for (const item of items) {
      if (!item.PK || !item.SK || item.type !== 'FILE_NODE') {
        skippedIneligibleCount += 1;
        continue;
      }

      const targetState = resolveIndexTargetState(item);
      if (!targetState) {
        skippedIneligibleCount += 1;
        continue;
      }

      if (targetState.state === 'TRASH') {
        eligibleTrashCount += 1;
      } else {
        eligiblePurgedCount += 1;
      }

      const stateIndexItem: FileStateIndexItem = {
        PK: item.PK,
        SK: buildFileStateIndexSk(targetState.state, targetState.timestampIso, targetState.fileNodeId),
        type: 'FILE_STATE_INDEX',
        state: targetState.state,
        fileNodeId: targetState.fileNodeId,
        ...(item.trashedPath ? { trashedPath: item.trashedPath } : {}),
        ...(targetState.state === 'TRASH' && item.size !== undefined ? { size: item.size } : {}),
        ...(targetState.state === 'TRASH' && item.deletedAt
          ? { deletedAt: item.deletedAt }
          : {}),
        ...(targetState.state === 'TRASH' && item.flaggedForDeleteAt
          ? { flaggedForDeleteAt: item.flaggedForDeleteAt }
          : {}),
        ...(targetState.state === 'PURGED' && item.purgedAt
          ? { purgedAt: item.purgedAt }
          : {}),
        updatedAt: item.updatedAt ?? targetState.timestampIso
      };

      if (dryRun) {
        dryRunCreateCount += 1;
        continue;
      }

      try {
        await dynamoDoc.send(
          new PutCommand({
            TableName: tableName,
            Item: stateIndexItem,
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
          })
        );
        createdCount += 1;
      } catch (error) {
        if (isConditionalFailure(error)) {
          alreadyExistsCount += 1;
          continue;
        }

        throw error;
      }
    }

    exclusiveStartKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
    if (options.maxPages && pageCount >= options.maxPages) {
      break;
    }
  } while (exclusiveStartKey);

  return {
    dryRun,
    pageSize,
    pageCount,
    scannedCount,
    eligibleTrashCount,
    eligiblePurgedCount,
    skippedIneligibleCount,
    createdCount,
    dryRunCreateCount,
    alreadyExistsCount
  };
};
