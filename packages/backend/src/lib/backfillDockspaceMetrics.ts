import { PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { buildFilePk, buildFileNodeSk, buildDockspaceMetricsSk } from '../domain/keys.js';
import { dynamoDoc } from './clients.js';
import type { DockspaceItem, DockspaceMetricsItem, FileNodeItem } from '../types/models.js';

const requiredTableName = (): string => {
  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    throw new Error('Missing required env var: TABLE_NAME');
  }

  return tableName;
};

export interface BackfillDockspaceMetricsOptions {
  dryRun?: boolean;
  pageSize?: number;
  maxPages?: number;
}

export interface BackfillDockspaceMetricsResult {
  dryRun: boolean;
  pageSize: number;
  pageCount: number;
  scannedDockspaceCount: number;
  metricsPreparedCount: number;
  metricsWrittenCount: number;
}

const listNonPurgedFileNodesForDockspace = async (
  tableName: string,
  userId: string,
  dockspaceId: string
): Promise<FileNodeItem[]> => {
  const items: FileNodeItem[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const page = await dynamoDoc.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        FilterExpression: '#type = :fileNodeType AND attribute_not_exists(purgedAt)',
        ExpressionAttributeNames: {
          '#type': 'type'
        },
        ExpressionAttributeValues: {
          ':pk': buildFilePk(userId, dockspaceId),
          ':skPrefix': buildFileNodeSk(''),
          ':fileNodeType': 'FILE_NODE'
        },
        ExclusiveStartKey: exclusiveStartKey
      })
    );

    items.push(...((page.Items ?? []) as FileNodeItem[]));
    exclusiveStartKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items;
};

const buildMetricsItemForDockspace = (
  dockspace: DockspaceItem,
  fileNodes: FileNodeItem[],
  nowIso: string
): DockspaceMetricsItem => {
  let totalSizeBytes = 0;
  let lastUploadAt: string | undefined;

  for (const fileNode of fileNodes) {
    totalSizeBytes += fileNode.size;
    const candidateTimestamp = fileNode.updatedAt || fileNode.createdAt;
    if (!candidateTimestamp) {
      continue;
    }

    if (!lastUploadAt || candidateTimestamp > lastUploadAt) {
      lastUploadAt = candidateTimestamp;
    }
  }

  return {
    PK: dockspace.PK,
    SK: buildDockspaceMetricsSk(dockspace.dockspaceId),
    type: 'DOCKSPACE_METRICS',
    dockspaceId: dockspace.dockspaceId,
    totalFileCount: fileNodes.length,
    totalSizeBytes,
    ...(lastUploadAt ? { lastUploadAt } : {}),
    updatedAt: nowIso
  };
};

export const backfillDockspaceMetrics = async (
  options: BackfillDockspaceMetricsOptions = {}
): Promise<BackfillDockspaceMetricsResult> => {
  const dryRun = options.dryRun ?? true;
  const pageSize = options.pageSize ?? 100;
  const tableName = requiredTableName();
  let exclusiveStartKey: Record<string, unknown> | undefined;
  let pageCount = 0;
  let scannedDockspaceCount = 0;
  let metricsPreparedCount = 0;
  let metricsWrittenCount = 0;

  do {
    const page = await dynamoDoc.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: '#type = :dockspaceType',
        ExpressionAttributeNames: {
          '#type': 'type'
        },
        ExpressionAttributeValues: {
          ':dockspaceType': 'DOCKSPACE'
        },
        ExclusiveStartKey: exclusiveStartKey,
        Limit: pageSize
      })
    );

    pageCount += 1;
    const dockspaces = (page.Items ?? []) as DockspaceItem[];
    scannedDockspaceCount += dockspaces.length;

    for (const dockspace of dockspaces) {
      const fileNodes = await listNonPurgedFileNodesForDockspace(
        tableName,
        dockspace.userId,
        dockspace.dockspaceId
      );
      const metricsItem = buildMetricsItemForDockspace(dockspace, fileNodes, new Date().toISOString());
      metricsPreparedCount += 1;

      if (dryRun) {
        continue;
      }

      await dynamoDoc.send(
        new PutCommand({
          TableName: tableName,
          Item: metricsItem
        })
      );
      metricsWrittenCount += 1;
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
    scannedDockspaceCount,
    metricsPreparedCount,
    metricsWrittenCount
  };
};
