import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { buildFilePk, buildFileSk, buildGsi1Pk, buildGsi1Sk } from '../domain/keys.js';
import { normalizeFullPath, toRelativePath } from '../domain/path.js';
import { getUserIdFromEvent } from '../lib/auth.js';
import { jsonResponse, safeJsonParse } from '../lib/http.js';
import { putFile } from '../lib/repository.js';
import { buildObjectKey, objectExists } from '../lib/s3.js';

const bodySchema = z.object({
  fullPath: z.string().trim().min(2),
  size: z.number().nonnegative(),
  etag: z.string().trim().min(1),
  contentType: z.string().trim().min(1)
});

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const userId = getUserIdFromEvent(event);
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

    await putFile({
      PK: buildFilePk(userId, vaultId),
      SK: buildFileSk(fullPath),
      type: 'FILE',
      userId,
      vaultId,
      fullPath,
      state: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      size: parsed.data.size,
      contentType: parsed.data.contentType,
      etag: parsed.data.etag,
      GSI1PK: buildGsi1Pk(userId, vaultId),
      GSI1SK: buildGsi1Sk('ACTIVE', fullPath)
    });

    return jsonResponse(201, {
      fullPath,
      state: 'ACTIVE',
      updatedAt: now
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
