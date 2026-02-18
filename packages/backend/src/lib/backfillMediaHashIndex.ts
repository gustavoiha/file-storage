import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { FileNodeItem } from '../types/models.js';
import { isMediaContentType } from '../types/models.js';
import { buildMediaHashIndexSk } from '../domain/keys.js';
import { dynamoDoc } from './clients.js';

const getFileNodeIdFromSk = (sk: string): string | null =>
  sk.startsWith('L#') ? sk.replace(/^L#/, '') : null;

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

export interface BackfillMediaHashIndexOptions {
  dryRun?: boolean;
  pageSize?: number;
  maxPages?: number;
  onProgress?: (progress: BackfillMediaHashIndexProgress) => void;
}

export interface BackfillMediaHashIndexResult {
  dryRun: boolean;
  pageSize: number;
  pageCount: number;
  scannedCount: number;
  eligibleCount: number;
  skippedIneligibleCount: number;
  insertedCount: number;
  dryRunInsertCount: number;
  alreadyExistsCount: number;
  failedCount: number;
}

export interface BackfillMediaHashIndexProgress {
  status: 'page' | 'inserted' | 'failed' | 'complete';
  pageCount: number;
  scannedCount: number;
  eligibleCount: number;
  insertedCount: number;
  dryRunInsertCount: number;
  alreadyExistsCount: number;
  failedCount: number;
  fileNodeId?: string;
  message?: string;
}

export const backfillMediaHashIndex = async (
  options: BackfillMediaHashIndexOptions = {}
): Promise<BackfillMediaHashIndexResult> => {
  const dryRun = options.dryRun ?? true;
  const pageSize = options.pageSize ?? 100;
  const tableName = requiredTableName();

  let exclusiveStartKey: Record<string, unknown> | undefined;
  let pageCount = 0;
  let scannedCount = 0;
  let eligibleCount = 0;
  let skippedIneligibleCount = 0;
  let insertedCount = 0;
  let dryRunInsertCount = 0;
  let alreadyExistsCount = 0;
  let failedCount = 0;

  do {
    const page = await dynamoDoc.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'PK, SK, #type, contentHash, contentType, updatedAt',
        FilterExpression:
          '#type = :fileNodeType AND attribute_not_exists(deletedAt) AND attribute_not_exists(purgedAt) AND attribute_exists(contentHash) AND size(contentHash) > :zero AND attribute_exists(contentType)',
        ExpressionAttributeNames: {
          '#type': 'type'
        },
        ExpressionAttributeValues: {
          ':fileNodeType': 'FILE_NODE',
          ':zero': 0
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
      insertedCount,
      dryRunInsertCount,
      alreadyExistsCount,
      failedCount,
      message: `Loaded page ${pageCount} with ${items.length} candidates`
    });

    for (const item of items) {
      const fileNodeId = item.SK ? getFileNodeIdFromSk(item.SK) : null;
      const contentHash = item.contentHash?.trim();
      const contentType = item.contentType?.trim();

      if (
        !item.PK ||
        !fileNodeId ||
        item.type !== 'FILE_NODE' ||
        !contentHash ||
        !contentType ||
        !isMediaContentType(contentType)
      ) {
        skippedIneligibleCount += 1;
        continue;
      }

      eligibleCount += 1;
      if (dryRun) {
        dryRunInsertCount += 1;
        continue;
      }

      try {
        await dynamoDoc.send(
          new PutCommand({
            TableName: tableName,
            Item: {
              PK: item.PK,
              SK: buildMediaHashIndexSk(contentHash, fileNodeId),
              type: 'MEDIA_HASH_INDEX',
              fileNodeId,
              contentHash,
              updatedAt: item.updatedAt ?? new Date().toISOString()
            },
            ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)'
          })
        );

        insertedCount += 1;
        options.onProgress?.({
          status: 'inserted',
          pageCount,
          scannedCount,
          eligibleCount,
          insertedCount,
          dryRunInsertCount,
          alreadyExistsCount,
          failedCount,
          fileNodeId,
          message: `Created media hash index for fileNodeId=${fileNodeId}`
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
          insertedCount,
          dryRunInsertCount,
          alreadyExistsCount,
          failedCount,
          fileNodeId,
          message:
            error instanceof Error
              ? `Failed to create media hash index for fileNodeId=${fileNodeId}: ${error.message}`
              : `Failed to create media hash index for fileNodeId=${fileNodeId}`
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
    insertedCount,
    dryRunInsertCount,
    alreadyExistsCount,
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
    insertedCount,
    dryRunInsertCount,
    alreadyExistsCount,
    failedCount
  };
};
