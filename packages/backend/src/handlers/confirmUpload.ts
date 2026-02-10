import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { normalizeFullPath, toRelativePath } from '../domain/path.js';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { upsertActiveFileByPath } from '../lib/repository.js';
import { buildObjectKey, objectExists } from '../lib/s3.js';

const bodySchema = z.object({
  fullPath: z.string().trim().min(2),
  size: z.number().nonnegative(),
  etag: z.string().trim().min(1),
  contentType: z.string().trim().min(1)
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
    const relativePath = toRelativePath(fullPath);
    const objectKey = buildObjectKey(userId, vaultId, relativePath);

    if (!(await objectExists(objectKey))) {
      return jsonResponse(409, { error: 'Object not found in S3' });
    }

    const now = new Date().toISOString();
    await upsertActiveFileByPath({
      userId,
      vaultId,
      fullPath,
      s3Key: objectKey,
      size: parsed.data.size,
      contentType: parsed.data.contentType,
      etag: parsed.data.etag,
      nowIso: now
    });

    return jsonResponse(201, {
      fullPath,
      state: 'ACTIVE',
      updatedAt: now
    });
  } catch (error) {
    return errorResponse(error);
  }
};
