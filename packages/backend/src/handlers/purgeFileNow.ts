import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { normalizeFullPath } from '../domain/path.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { findTrashedFileByFullPath, markFileNodePurged } from '../lib/repository.js';
import { purgeObjectVersions } from '../lib/s3.js';

const bodySchema = z.object({
  fullPath: z.string().trim().min(2)
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
    const fileNode = await findTrashedFileByFullPath(userId, dockspaceId, fullPath);
    if (!fileNode) {
      return jsonResponse(404, { error: 'Trashed file not found' });
    }

    const purgeResult = await purgeObjectVersions(fileNode.s3Key);
    if (purgeResult.remainingVersionCount > 0) {
      return jsonResponse(409, {
        error: 'Could not fully purge object versions from S3',
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
      state: 'PURGED',
      purgedAt: nowIso
    });
  } catch (error) {
    return errorResponse(error);
  }
};
