import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { normalizeFullPath } from '../domain/path.js';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { resolveFileByFullPath, upsertActiveFileByPath } from '../lib/repository.js';
import { buildObjectKey, objectExists, parseObjectKey } from '../lib/s3.js';

const bodySchema = z.object({
  fullPath: z.string().trim().min(2),
  objectKey: z.string().trim().min(3),
  size: z.number().nonnegative(),
  etag: z.string().trim().min(1),
  contentType: z.string().trim().min(1)
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
    const objectKeyInfo = parseObjectKey(dockspaceId, parsed.data.objectKey);
    if (!objectKeyInfo) {
      return jsonResponse(400, { error: 'Invalid objectKey' });
    }

    const existingFile = await resolveFileByFullPath(userId, dockspaceId, fullPath);
    const existingFileNodeId = existingFile?.fileNode.SK.replace(/^L#/, '');
    const expectedObjectKey = existingFileNodeId
      ? buildObjectKey(dockspaceId, existingFileNodeId)
      : parsed.data.objectKey;

    if (expectedObjectKey !== parsed.data.objectKey) {
      return jsonResponse(409, { error: 'Upload key does not match target file path' });
    }

    if (!(await objectExists(parsed.data.objectKey))) {
      return jsonResponse(409, { error: 'Object not found in S3' });
    }

    const now = new Date().toISOString();
    await upsertActiveFileByPath({
      userId,
      dockspaceId,
      fullPath,
      s3Key: parsed.data.objectKey,
      preferredFileNodeId: existingFileNodeId ?? objectKeyInfo.fileNodeId,
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
