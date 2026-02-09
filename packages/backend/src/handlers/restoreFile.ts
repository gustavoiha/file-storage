import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { normalizeFullPath, toRelativePath } from '../domain/path.js';
import { getFile, updateFileState } from '../lib/repository.js';
import { buildObjectKey, clearTrashTag, objectExists } from '../lib/s3.js';

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

    if (!file || file.state !== 'TRASH') {
      return jsonResponse(404, { error: 'Trashed file not found' });
    }

    const objectKey = buildObjectKey(userId, vaultId, toRelativePath(fullPath));
    const now = new Date().toISOString();

    if (!(await objectExists(objectKey))) {
      await updateFileState(file, 'PURGED', now);
      return jsonResponse(409, {
        error: 'Object already purged from S3',
        state: 'PURGED'
      });
    }

    await updateFileState(file, 'ACTIVE', now);
    await clearTrashTag(objectKey);

    return jsonResponse(200, {
      fullPath,
      state: 'ACTIVE'
    });
  } catch (error) {
    return errorResponse(error);
  }
};
