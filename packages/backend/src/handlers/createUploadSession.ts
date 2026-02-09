import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { toRelativePath } from '../domain/path.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { buildObjectKey, createUploadUrl } from '../lib/s3.js';

const bodySchema = z.object({
  fullPath: z.string().trim().min(2),
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

    const relativePath = toRelativePath(parsed.data.fullPath);
    const objectKey = buildObjectKey(userId, vaultId, relativePath);
    const uploadUrl = await createUploadUrl(objectKey, parsed.data.contentType);

    return jsonResponse(200, {
      uploadUrl,
      objectKey,
      expiresInSeconds: 900
    });
  } catch (error) {
    return errorResponse(error);
  }
};
