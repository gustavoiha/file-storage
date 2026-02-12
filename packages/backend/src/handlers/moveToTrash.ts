import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { normalizeFullPath } from '../domain/path.js';
import { env } from '../lib/env.js';
import { errorResponse, isoPlusDays, jsonResponse, safeJsonParse } from '../lib/http.js';
import { fileStateFromNode } from '../types/models.js';
import { markResolvedFileNodeTrashed, resolveFileByFullPath } from '../lib/repository.js';
import { tagObjectTrash } from '../lib/s3.js';

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
    const resolved = await resolveFileByFullPath(userId, dockspaceId, fullPath);

    if (!resolved || fileStateFromNode(resolved.fileNode) !== 'ACTIVE') {
      return jsonResponse(404, { error: 'Active file not found' });
    }

    const now = new Date().toISOString();
    const flaggedForDeleteAt = isoPlusDays(now, env.trashRetentionDays);
    const objectKey = resolved.fileNode.s3Key;

    await markResolvedFileNodeTrashed(userId, dockspaceId, resolved, now, flaggedForDeleteAt);
    await tagObjectTrash(objectKey);

    return jsonResponse(200, {
      fullPath,
      state: 'TRASH',
      flaggedForDeleteAt
    });
  } catch (error) {
    return errorResponse(error);
  }
};
