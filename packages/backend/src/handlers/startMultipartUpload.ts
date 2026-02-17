import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { normalizeFullPath, splitFullPath } from '../domain/path.js';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { getDockspaceById, resolveFileByFullPath } from '../lib/repository.js';
import { buildObjectKey, startMultipartUpload } from '../lib/s3.js';
import { dockspaceTypeFromItem, isMediaContentType, isMediaDockspaceType } from '../types/models.js';

const MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_PART_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_MULTIPART_PARTS = 10_000;
const URL_EXPIRES_IN_SECONDS = 900;

const bodySchema = z.object({
  fullPath: z.string().trim().min(2),
  contentType: z.string().trim().min(1),
  size: z.number().int().positive()
});

const calculatePartSize = (size: number): number => {
  const minSizeForPartLimit = Math.ceil(size / MAX_MULTIPART_PARTS);
  const targetSize = Math.max(MIN_PART_SIZE_BYTES, DEFAULT_PART_SIZE_BYTES, minSizeForPartLimit);
  return Math.ceil(targetSize / MIN_PART_SIZE_BYTES) * MIN_PART_SIZE_BYTES;
};

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
    const dockspace = await getDockspaceById(userId, dockspaceId);
    if (!dockspace) {
      return jsonResponse(404, { error: 'Dockspace not found' });
    }

    const dockspaceType = dockspaceTypeFromItem(dockspace);
    if (isMediaDockspaceType(dockspaceType)) {
      if (!isMediaContentType(parsed.data.contentType)) {
        return jsonResponse(400, {
          error: 'PHOTOS_VIDEOS dockspaces only accept image/* or video/* uploads'
        });
      }

      if (splitFullPath(fullPath).folderPath !== '/') {
        return jsonResponse(400, {
          error: 'PHOTOS_VIDEOS dockspaces require uploads at the root path'
        });
      }
    }

    const existingFile = await resolveFileByFullPath(userId, dockspaceId, fullPath);
    if (!isMediaDockspaceType(dockspaceType) && existingFile) {
      return jsonResponse(409, {
        error: 'Upload skipped due to duplicate',
        code: 'UPLOAD_SKIPPED_DUPLICATE',
        duplicateType: 'NAME',
        fullPath,
        reason: 'A file with the same name already exists in this folder.'
      });
    }

    const fileNodeId = isMediaDockspaceType(dockspaceType)
      ? randomUUID()
      : existingFile?.fileNode.SK.replace(/^L#/, '') ?? randomUUID();
    const objectKey = buildObjectKey(dockspaceId, fileNodeId);
    const uploadId = await startMultipartUpload(objectKey, parsed.data.contentType);
    const partSize = calculatePartSize(parsed.data.size);
    const partCount = Math.ceil(parsed.data.size / partSize);

    return jsonResponse(200, {
      uploadId,
      objectKey,
      fileNodeId,
      partSize,
      partCount,
      expiresInSeconds: URL_EXPIRES_IN_SECONDS
    });
  } catch (error) {
    return errorResponse(error);
  }
};
