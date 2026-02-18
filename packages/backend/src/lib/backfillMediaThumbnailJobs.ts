import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { buildThumbnailMetadataSk, parseDockspacePartitionSk } from '../domain/keys.js';
import { isMediaContentType, type ThumbnailMetadataItem } from '../types/models.js';
import { dynamoDoc } from './clients.js';
import { buildThumbnailJob, enqueueThumbnailJob } from './thumbnailQueue.js';

const getFileNodeIdFromSk = (sk: string): string | null =>
  sk.startsWith('L#') ? sk.replace(/^L#/, '') : null;

const requiredTableName = (): string => {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('Missing required env var: TABLE_NAME');
  }

  return tableName;
};

interface CandidateFileNodeItem {
  PK?: string;
  SK?: string;
  type?: string;
  s3Key?: string;
  contentType?: string;
  etag?: string;
}

export interface BackfillMediaThumbnailJobsOptions {
  dryRun?: boolean;
  pageSize?: number;
  maxPages?: number;
  onProgress?: (progress: BackfillMediaThumbnailJobsProgress) => void;
}

export interface BackfillMediaThumbnailJobsResult {
  dryRun: boolean;
  pageSize: number;
  pageCount: number;
  scannedCount: number;
  eligibleCount: number;
  skippedIneligibleCount: number;
  needsThumbnailCount: number;
  alreadyUpToDateCount: number;
  enqueuedCount: number;
  dryRunEnqueueCount: number;
  failedCount: number;
}

export interface BackfillMediaThumbnailJobsProgress {
  status: 'page' | 'enqueued' | 'failed' | 'complete';
  pageCount: number;
  scannedCount: number;
  eligibleCount: number;
  needsThumbnailCount: number;
  alreadyUpToDateCount: number;
  enqueuedCount: number;
  dryRunEnqueueCount: number;
  failedCount: number;
  fileNodeId?: string;
  message?: string;
}

const thumbnailReadyForCurrentSource = (
  thumbnail: ThumbnailMetadataItem | null,
  etag: string
): boolean =>
  Boolean(
    thumbnail &&
      thumbnail.status === 'READY' &&
      thumbnail.sourceEtag === etag &&
      thumbnail.thumbnailKey
  );

export const backfillMediaThumbnailJobs = async (
  options: BackfillMediaThumbnailJobsOptions = {}
): Promise<BackfillMediaThumbnailJobsResult> => {
  const dryRun = options.dryRun ?? true;
  const pageSize = options.pageSize ?? 100;
  const tableName = requiredTableName();

  let exclusiveStartKey: Record<string, unknown> | undefined;
  let pageCount = 0;
  let scannedCount = 0;
  let eligibleCount = 0;
  let skippedIneligibleCount = 0;
  let needsThumbnailCount = 0;
  let alreadyUpToDateCount = 0;
  let enqueuedCount = 0;
  let dryRunEnqueueCount = 0;
  let failedCount = 0;

  do {
    const page = await dynamoDoc.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'PK, SK, #type, s3Key, contentType, etag',
        FilterExpression:
          '#type = :fileNodeType AND attribute_not_exists(deletedAt) AND attribute_not_exists(purgedAt) AND attribute_exists(s3Key) AND attribute_exists(contentType) AND attribute_exists(etag)',
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
    const items = (page.Items ?? []) as CandidateFileNodeItem[];
    scannedCount += items.length;
    options.onProgress?.({
      status: 'page',
      pageCount,
      scannedCount,
      eligibleCount,
      needsThumbnailCount,
      alreadyUpToDateCount,
      enqueuedCount,
      dryRunEnqueueCount,
      failedCount,
      message: `Loaded page ${pageCount} with ${items.length} candidates`
    });

    for (const item of items) {
      const partition = item.PK ? parseDockspacePartitionSk(item.PK) : null;
      const fileNodeId = item.SK ? getFileNodeIdFromSk(item.SK) : null;
      const contentType = item.contentType?.trim();
      const s3Key = item.s3Key?.trim();
      const etag = item.etag?.trim();

      if (
        item.type !== 'FILE_NODE' ||
        !partition ||
        !fileNodeId ||
        !s3Key ||
        !etag ||
        !contentType ||
        !isMediaContentType(contentType)
      ) {
        skippedIneligibleCount += 1;
        continue;
      }

      eligibleCount += 1;

      const thumbnailResponse = await dynamoDoc.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            PK: item.PK,
            SK: buildThumbnailMetadataSk(fileNodeId)
          }
        })
      );
      const thumbnail = (thumbnailResponse.Item as ThumbnailMetadataItem | undefined) ?? null;
      if (thumbnailReadyForCurrentSource(thumbnail, etag)) {
        alreadyUpToDateCount += 1;
        continue;
      }

      needsThumbnailCount += 1;
      if (dryRun) {
        dryRunEnqueueCount += 1;
        continue;
      }

      try {
        await enqueueThumbnailJob(
          buildThumbnailJob({
            userId: partition.userId,
            dockspaceId: partition.dockspaceId,
            fileNodeId,
            s3Key,
            contentType,
            etag
          })
        );
        enqueuedCount += 1;
        options.onProgress?.({
          status: 'enqueued',
          pageCount,
          scannedCount,
          eligibleCount,
          needsThumbnailCount,
          alreadyUpToDateCount,
          enqueuedCount,
          dryRunEnqueueCount,
          failedCount,
          fileNodeId,
          message: `Enqueued thumbnail job for fileNodeId=${fileNodeId}`
        });
      } catch (error) {
        failedCount += 1;
        options.onProgress?.({
          status: 'failed',
          pageCount,
          scannedCount,
          eligibleCount,
          needsThumbnailCount,
          alreadyUpToDateCount,
          enqueuedCount,
          dryRunEnqueueCount,
          failedCount,
          fileNodeId,
          message:
            error instanceof Error
              ? `Failed to enqueue thumbnail job for fileNodeId=${fileNodeId}: ${error.message}`
              : `Failed to enqueue thumbnail job for fileNodeId=${fileNodeId}`
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
    needsThumbnailCount,
    alreadyUpToDateCount,
    enqueuedCount,
    dryRunEnqueueCount,
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
    needsThumbnailCount,
    alreadyUpToDateCount,
    enqueuedCount,
    dryRunEnqueueCount,
    failedCount
  };
};
