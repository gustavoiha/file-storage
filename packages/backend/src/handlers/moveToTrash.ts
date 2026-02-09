import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { normalizeFullPath, toRelativePath } from '../domain/path.js';
import { env } from '../lib/env.js';
import { errorResponse, isoPlusDays, jsonResponse, safeJsonParse } from '../lib/http.js';
import { getFile, updateFileState } from '../lib/repository.js';
import { buildObjectKey, tagObjectTrash } from '../lib/s3.js';

const bodySchema = z.object({
  fullPath: z.string().trim().min(2)
});

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const vaultId = event.pathParameters?.vaultId;

    if (!vaultId) {
      return jsonResponse(400, { error: 'vaultId is required' });
    }

    const parsed = bodySchema.safeParse(safeJsonParse(event.body));
    if (!parsed.success) {
      return jsonResponse(400, { error: 'Invalid request body' });
    }

    const fullPath = normalizeFullPath(parsed.data.fullPath);
    const file = await getFile(userId, vaultId, fullPath);

    if (!file || file.state !== 'ACTIVE') {
      return jsonResponse(404, { error: 'Active file not found' });
    }

    const now = new Date().toISOString();
    const flaggedForDeleteAt = isoPlusDays(now, env.trashRetentionDays);
    const objectKey = buildObjectKey(userId, vaultId, toRelativePath(fullPath));

    await updateFileState(file, 'TRASH', now, flaggedForDeleteAt);
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
