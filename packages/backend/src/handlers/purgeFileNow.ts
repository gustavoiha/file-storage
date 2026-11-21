import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { normalizeFullPath } from '../domain/path.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { markFileNodePurged } from '../lib/repository.js';
import {
  buildThumbnailObjectPrefix,
  purgeObjectVersions,
  purgeObjectVersionsByPrefix
} from '../lib/s3.js';
import {
  AMBIGUOUS_TRASHED_FILE_ERROR,
  fileNodeIdFromFileNode,
  resolveTrashedFileTarget
} from '../lib/trashedFileTarget.js';

const bodySchema = z.object({
  fullPath: z.string().trim().min(2),
  fileNodeId: z.string().trim().min(1).max(200).optional()
});

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const dockspaceId = event.pathParameters?.dockspaceId;

    if (!dockspaceId) {
      return jsonResponse(400, { error: 'dockspaceId is required' });
    }

    const parsed = bodySchema.safeParse(safeJsonParse(event.body));
    if (!parsed.success) {
      return jsonResponse(400, { error: 'Invalid request body' });
    }

    const fullPath = normalizeFullPath(parsed.data.fullPath);
    const target = await resolveTrashedFileTarget({
      userId,
      dockspaceId,
      fullPath,
      fileNodeId: parsed.data.fileNodeId
    });
    if (target.status === 'ambiguous') {
      return jsonResponse(409, { error: AMBIGUOUS_TRASHED_FILE_ERROR, state: 'TRASH' });
    }
    if (target.status === 'not-found') {
      return jsonResponse(404, { error: 'Trashed file not found' });
    }

    const { fileNode } = target;
    const fileNodeId = fileNodeIdFromFileNode(fileNode);

    const purgeResult = await purgeObjectVersions(fileNode.s3Key);
    if (purgeResult.remainingVersionCount > 0) {
      return jsonResponse(409, {
        error: 'Could not fully purge object versions from S3',
        state: 'TRASH'
      });
    }

    const thumbnailPurgeResult = await purgeObjectVersionsByPrefix(
      buildThumbnailObjectPrefix(dockspaceId, fileNodeId)
    );
    if (thumbnailPurgeResult.remainingVersionCount > 0) {
      return jsonResponse(409, {
        error: 'Could not fully purge thumbnail object versions from S3',
        state: 'TRASH'
      });
    }

    const nowIso = new Date().toISOString();
    await markFileNodePurged({
      userId,
      dockspaceId,
      fileNode,
      nowIso
    });

    return jsonResponse(200, {
      fullPath,
      fileNodeId,
      state: 'PURGED',
      purgedAt: nowIso
    });
  } catch (error) {
    return errorResponse(error);
  }
};
