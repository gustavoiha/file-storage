import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { buildPurgeDueGsi1Sk, PURGE_DUE_GSI1_PK } from '../domain/keys.js';
import { dynamoDoc } from './clients.js';
import type { FileNodeItem } from '../types/models.js';

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

export interface BackfillPurgeDueGsiOptions {
  dryRun?: boolean;
  pageSize?: number;
  maxPages?: number;
}

export interface BackfillPurgeDueGsiResult {
  dryRun: boolean;
  pageSize: number;
  pageCount: number;
  scannedCount: number;
  eligibleCount: number;
  alreadyIndexedCount: number;
  skippedIneligibleCount: number;
  updatedCount: number;
  dryRunUpdateCount: number;
  skippedConditionalCount: number;
}

type EligibleTrashedFileNode = FileNodeItem & {
  deletedAt: string;
  flaggedForDeleteAt: string;
  purgedAt?: undefined;
};

const isEligibleTrashedFileNode = (
  item: Partial<FileNodeItem>
): item is EligibleTrashedFileNode =>
  item.type === 'FILE_NODE' &&
  Boolean(item.PK) &&
  Boolean(item.SK) &&
  Boolean(item.deletedAt) &&
  Boolean(item.flaggedForDeleteAt) &&
  !item.purgedAt;

export const backfillPurgeDueGsi = async (
  options: BackfillPurgeDueGsiOptions = {}
): Promise<BackfillPurgeDueGsiResult> => {
  const dryRun = options.dryRun ?? true;
  const pageSize = options.pageSize ?? 200;
  const tableName = requiredTableName();

  let exclusiveStartKey: Record<string, unknown> | undefined;
  let pageCount = 0;
  let scannedCount = 0;
  let eligibleCount = 0;
  let alreadyIndexedCount = 0;
  let skippedIneligibleCount = 0;
  let updatedCount = 0;
  let dryRunUpdateCount = 0;
  let skippedConditionalCount = 0;

  do {
    const page = await dynamoDoc.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression:
          'PK, SK, #type, deletedAt, flaggedForDeleteAt, purgedAt, GSI1PK, GSI1SK',
        FilterExpression:
          '#type = :fileNodeType AND attribute_exists(deletedAt) AND attribute_not_exists(purgedAt) AND attribute_exists(flaggedForDeleteAt)',
        ExpressionAttributeNames: {
          '#type': 'type'
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
      if (!isEligibleTrashedFileNode(item)) {
        skippedIneligibleCount += 1;
        continue;
      }

      const expectedGsi1Sk = buildPurgeDueGsi1Sk(item.flaggedForDeleteAt, item.PK, item.SK);
      const alreadyIndexed =
        item.GSI1PK === PURGE_DUE_GSI1_PK && item.GSI1SK === expectedGsi1Sk;

      if (alreadyIndexed) {
        alreadyIndexedCount += 1;
        continue;
      }

      eligibleCount += 1;

      if (dryRun) {
        dryRunUpdateCount += 1;
        continue;
      }

      try {
        await dynamoDoc.send(
          new UpdateCommand({
            TableName: tableName,
            Key: {
              PK: item.PK,
              SK: item.SK
            },
            ConditionExpression:
              'attribute_exists(deletedAt) AND attribute_not_exists(purgedAt) AND attribute_exists(flaggedForDeleteAt)',
            UpdateExpression: 'SET GSI1PK = :gsi1pk, GSI1SK = :gsi1sk',
            ExpressionAttributeValues: {
              ':gsi1pk': PURGE_DUE_GSI1_PK,
              ':gsi1sk': expectedGsi1Sk
            }
          })
        );

        updatedCount += 1;
      } catch (error) {
        if (isConditionalFailure(error)) {
          skippedConditionalCount += 1;
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
    eligibleCount,
    alreadyIndexedCount,
    skippedIneligibleCount,
    updatedCount,
    dryRunUpdateCount,
    skippedConditionalCount
  };
};
