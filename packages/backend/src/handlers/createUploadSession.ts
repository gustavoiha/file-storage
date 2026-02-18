import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { normalizeFullPath, splitFullPath } from '../domain/path.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { buildObjectKey, createUploadUrl } from '../lib/s3.js';
import {
  getDockspaceById,
  hasActiveMediaWithContentHash,
  resolveFileByFullPath
} from '../lib/repository.js';
import { dockspaceTypeFromItem, isMediaContentType, isMediaDockspaceType } from '../types/models.js';

const CONTENT_HASH_REGEX = /^[a-f0-9]{64}$/;

const bodySchema = z.object({
  fullPath: z.string().trim().min(2),
  contentType: z.string().trim().min(1),
  contentHash: z.string().trim().optional()
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

    const normalizedFullPath = normalizeFullPath(parsed.data.fullPath);
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

      if (splitFullPath(normalizedFullPath).folderPath !== '/') {
        return jsonResponse(400, {
          error: 'PHOTOS_VIDEOS dockspaces require uploads at the root path'
        });
      }

      const contentHash = parsed.data.contentHash?.toLowerCase();
      if (!contentHash || !CONTENT_HASH_REGEX.test(contentHash)) {
        return jsonResponse(400, {
          error: 'contentHash is required for PHOTOS_VIDEOS uploads and must be a sha256 hex value'
        });
      }

      const duplicateByHash = await hasActiveMediaWithContentHash({
        userId,
        dockspaceId,
        contentHash
      });
      if (duplicateByHash) {
        return jsonResponse(409, {
          error: 'Upload skipped due to duplicate',
          code: 'UPLOAD_SKIPPED_DUPLICATE',
          duplicateType: 'CONTENT_HASH',
          fullPath: normalizedFullPath,
          reason: 'A media file with the same content already exists in this dockspace.'
        });
      }
    }

    const existingFile = await resolveFileByFullPath(userId, dockspaceId, normalizedFullPath);
    if (!isMediaDockspaceType(dockspaceType) && existingFile) {
      return jsonResponse(409, {
        error: 'Upload skipped due to duplicate',
        code: 'UPLOAD_SKIPPED_DUPLICATE',
        duplicateType: 'NAME',
        fullPath: normalizedFullPath,
        reason: 'A file with the same name already exists in this folder.'
      });
    }

    const fileNodeId = isMediaDockspaceType(dockspaceType)
      ? randomUUID()
      : existingFile?.fileNode.SK.replace(/^L#/, '') ?? randomUUID();
    const objectKey = buildObjectKey(dockspaceId, fileNodeId);
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
