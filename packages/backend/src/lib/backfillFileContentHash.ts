import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDoc } from './clients.js';
import { computeObjectSha256Hex, objectExists } from './s3.js';
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

export interface BackfillFileContentHashOptions {
  dryRun?: boolean;
  pageSize?: number;
  maxPages?: number;
  onProgress?: (progress: BackfillFileContentHashProgress) => void;
}

export interface BackfillFileContentHashResult {
  dryRun: boolean;
  pageSize: number;
  pageCount: number;
  scannedCount: number;
  eligibleCount: number;
  skippedIneligibleCount: number;
  missingObjectCount: number;
  updatedCount: number;
  dryRunUpdateCount: number;
  alreadyExistsCount: number;
  failedCount: number;
}

export interface BackfillFileContentHashProgress {
  status: 'page' | 'updated' | 'missing-object' | 'failed' | 'complete';
  pageCount: number;
  scannedCount: number;
  eligibleCount: number;
  missingObjectCount: number;
  updatedCount: number;
  dryRunUpdateCount: number;
  failedCount: number;
  key?: string;
  message?: string;
}

export const backfillFileContentHash = async (
  options: BackfillFileContentHashOptions = {}
): Promise<BackfillFileContentHashResult> => {
  const dryRun = options.dryRun ?? true;
  const pageSize = options.pageSize ?? 100;
  const tableName = requiredTableName();

  let exclusiveStartKey: Record<string, unknown> | undefined;
  let pageCount = 0;
  let scannedCount = 0;
  let eligibleCount = 0;
  let skippedIneligibleCount = 0;
  let missingObjectCount = 0;
  let updatedCount = 0;
  let dryRunUpdateCount = 0;
  let alreadyExistsCount = 0;
  let failedCount = 0;

  do {
    const page = await dynamoDoc.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'PK, SK, #type, s3Key, contentHash',
        FilterExpression:
          '#type = :fileNodeType AND attribute_not_exists(contentHash) AND attribute_exists(s3Key)',
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
    options.onProgress?.({
      status: 'page',
      pageCount,
      scannedCount,
      eligibleCount,
      missingObjectCount,
      updatedCount,
      dryRunUpdateCount,
      failedCount,
      message: `Loaded page ${pageCount} with ${items.length} candidates`
    });

    for (const item of items) {
      if (!item.PK || !item.SK || item.type !== 'FILE_NODE' || !item.s3Key) {
        skippedIneligibleCount += 1;
        continue;
      }

      eligibleCount += 1;
      if (dryRun) {
        dryRunUpdateCount += 1;
        continue;
      }

      const exists = await objectExists(item.s3Key);
      if (!exists) {
        missingObjectCount += 1;
        options.onProgress?.({
          status: 'missing-object',
          pageCount,
          scannedCount,
          eligibleCount,
          missingObjectCount,
          updatedCount,
          dryRunUpdateCount,
          failedCount,
          key: item.s3Key,
          message: `Object missing for key ${item.s3Key}`
        });
        continue;
      }

      try {
        const contentHash = await computeObjectSha256Hex(item.s3Key);
        await dynamoDoc.send(
          new UpdateCommand({
            TableName: tableName,
            Key: {
              PK: item.PK,
              SK: item.SK
            },
            ConditionExpression:
              'attribute_exists(PK) AND attribute_exists(SK) AND attribute_not_exists(contentHash)',
            UpdateExpression: 'SET contentHash = :contentHash',
            ExpressionAttributeValues: {
              ':contentHash': contentHash
            }
          })
        );
        updatedCount += 1;
        options.onProgress?.({
          status: 'updated',
          pageCount,
          scannedCount,
          eligibleCount,
          missingObjectCount,
          updatedCount,
          dryRunUpdateCount,
          failedCount,
          key: item.s3Key,
          message: `Saved contentHash for key ${item.s3Key}`
        });
      } catch (error) {
        if (isConditionalFailure(error)) {
          alreadyExistsCount += 1;
          continue;
        }

        failedCount += 1;
        options.onProgress?.({
          status: 'failed',
          pageCount,
          scannedCount,
          eligibleCount,
          missingObjectCount,
          updatedCount,
          dryRunUpdateCount,
          failedCount,
          key: item.s3Key,
          message:
            error instanceof Error
              ? `Failed to save contentHash for key ${item.s3Key}: ${error.message}`
              : `Failed to save contentHash for key ${item.s3Key}`
        });
      }
    }

    exclusiveStartKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
    if (options.maxPages && pageCount >= options.maxPages) {
      break;
    }
  } while (exclusiveStartKey);

  options.onProgress?.({
    status: 'complete',
    pageCount,
    scannedCount,
    eligibleCount,
    missingObjectCount,
    updatedCount,
    dryRunUpdateCount,
    failedCount,
    message: 'Backfill complete'
  });

  return {
    dryRun,
    pageSize,
    pageCount,
    scannedCount,
    eligibleCount,
    skippedIneligibleCount,
    missingObjectCount,
    updatedCount,
    dryRunUpdateCount,
    alreadyExistsCount,
    failedCount
  };
};
