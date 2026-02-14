import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { buildObjectKey, completeMultipartUpload, objectExists, parseObjectKey } from '../lib/s3.js';
import { normalizeFullPath } from '../domain/path.js';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { resolveFileByFullPath, upsertActiveFileByPath } from '../lib/repository.js';

const bodySchema = z.object({
  fullPath: z.string().trim().min(2),
  objectKey: z.string().trim().min(3),
  uploadId: z.string().trim().min(1),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1).max(10_000),
        etag: z.string().trim().min(1)
      })
    )
    .min(1),
  size: z.number().nonnegative(),
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

    for (let index = 1; index < parsed.data.parts.length; index += 1) {
      if (parsed.data.parts[index]!.partNumber <= parsed.data.parts[index - 1]!.partNumber) {
        return jsonResponse(400, { error: 'parts must be sorted by partNumber and unique' });
      }
    }

    const existingFile = await resolveFileByFullPath(userId, dockspaceId, fullPath);
    const existingFileNodeId = existingFile?.fileNode.SK.replace(/^L#/, '');
    const expectedObjectKey = existingFileNodeId
      ? buildObjectKey(dockspaceId, existingFileNodeId)
      : parsed.data.objectKey;

    if (expectedObjectKey !== parsed.data.objectKey) {
      return jsonResponse(409, { error: 'Upload key does not match target file path' });
    }

    const completedEtag = await completeMultipartUpload({
      key: parsed.data.objectKey,
      uploadId: parsed.data.uploadId,
      parts: parsed.data.parts
    });

    if (!(await objectExists(parsed.data.objectKey))) {
      return jsonResponse(409, { error: 'Object not found in S3 after completion' });
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
      etag: completedEtag ?? parsed.data.parts[parsed.data.parts.length - 1]!.etag,
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
