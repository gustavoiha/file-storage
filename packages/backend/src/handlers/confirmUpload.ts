import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { normalizeFullPath, splitFullPath } from '../domain/path.js';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import {
  getDockspaceById,
  hasActiveMediaWithContentHash,
  resolveFileByFullPath,
  upsertActiveFileByPath
} from '../lib/repository.js';
import {
  buildObjectKey,
  computeObjectSha256Hex,
  deleteObjectIfExists,
  objectExists,
  parseObjectKey
} from '../lib/s3.js';
import { buildThumbnailJob, enqueueThumbnailJobIfConfigured } from '../lib/thumbnailQueue.js';
import { dockspaceTypeFromItem, isMediaContentType, isMediaDockspaceType } from '../types/models.js';

const bodySchema = z.object({
  fullPath: z.string().trim().min(2),
  objectKey: z.string().trim().min(3),
  size: z.number().nonnegative(),
  etag: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  contentHash: z.string().trim().optional()
});
const CONTENT_HASH_REGEX = /^[a-f0-9]{64}$/;

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

    const objectKeyInfo = parseObjectKey(dockspaceId, parsed.data.objectKey);
    if (!objectKeyInfo) {
      return jsonResponse(400, { error: 'Invalid objectKey' });
    }

    const existingFile = await resolveFileByFullPath(userId, dockspaceId, fullPath);
    const existingFileNodeId = existingFile?.fileNode.SK.replace(/^L#/, '');
    const expectedObjectKey =
      !isMediaDockspaceType(dockspaceType) && existingFileNodeId
        ? buildObjectKey(dockspaceId, existingFileNodeId)
        : parsed.data.objectKey;

    if (expectedObjectKey !== parsed.data.objectKey) {
      if (!isMediaDockspaceType(dockspaceType)) {
        return jsonResponse(409, {
          error: 'Upload skipped due to duplicate',
          code: 'UPLOAD_SKIPPED_DUPLICATE',
          duplicateType: 'NAME',
          fullPath,
          reason: 'A file with the same name already exists in this folder.'
        });
      }

      return jsonResponse(409, { error: 'Upload key does not match target file path' });
    }

    if (!(await objectExists(parsed.data.objectKey))) {
      return jsonResponse(409, { error: 'Object not found in S3' });
    }

    const providedContentHash = parsed.data.contentHash?.toLowerCase();
    if (providedContentHash && !CONTENT_HASH_REGEX.test(providedContentHash)) {
      return jsonResponse(400, {
        error: 'contentHash must be a sha256 hex value when provided'
      });
    }

    const contentHash = providedContentHash ?? (await computeObjectSha256Hex(parsed.data.objectKey));
    if (isMediaDockspaceType(dockspaceType)) {
      const duplicateByHash = await hasActiveMediaWithContentHash({
        userId,
        dockspaceId,
        contentHash
      });
      if (duplicateByHash) {
        await deleteObjectIfExists(parsed.data.objectKey);
        return jsonResponse(409, {
          error: 'Upload skipped due to duplicate',
          code: 'UPLOAD_SKIPPED_DUPLICATE',
          duplicateType: 'CONTENT_HASH',
          fullPath,
          reason: 'A media file with the same content already exists in this dockspace.'
        });
      }
    }

    const now = new Date().toISOString();
    const upserted = await upsertActiveFileByPath({
      userId,
      dockspaceId,
      fullPath,
      s3Key: parsed.data.objectKey,
      preferredFileNodeId: existingFileNodeId ?? objectKeyInfo.fileNodeId,
      size: parsed.data.size,
      contentType: parsed.data.contentType,
      contentHash,
      etag: parsed.data.etag,
      nowIso: now
    });
    try {
      await enqueueThumbnailJobIfConfigured(
        buildThumbnailJob({
          userId,
          dockspaceId,
          fileNodeId: upserted.fileNodeId,
          s3Key: parsed.data.objectKey,
          contentType: parsed.data.contentType,
          etag: parsed.data.etag
        })
      );
    } catch (error) {
      console.warn('thumbnail-job-enqueue-failed', {
        dockspaceId,
        fileNodeId: upserted.fileNodeId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    if (
      isMediaDockspaceType(dockspaceType) &&
      existingFile?.fileNode.s3Key &&
      existingFile.fileNode.s3Key !== parsed.data.objectKey
    ) {
      await deleteObjectIfExists(existingFile.fileNode.s3Key);
    }

    return jsonResponse(201, {
      fullPath,
      state: 'ACTIVE',
      updatedAt: now
    });
  } catch (error) {
    return errorResponse(error);
  }
};
