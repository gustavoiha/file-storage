import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import {
  buildObjectKey,
  completeMultipartUpload,
  computeObjectSha256Hex,
  deleteObjectIfExists,
  objectExists,
  parseObjectKey
} from '../lib/s3.js';
import { normalizeFullPath, splitFullPath } from '../domain/path.js';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import {
  findActiveMediaFileByContentHash,
  getDockspaceById,
  resolveFileByFullPath,
  upsertActiveFileByPath
} from '../lib/repository.js';
import { dockspaceTypeFromItem, isMediaContentType, isMediaDockspaceType } from '../types/models.js';

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

    for (let index = 1; index < parsed.data.parts.length; index += 1) {
      if (parsed.data.parts[index]!.partNumber <= parsed.data.parts[index - 1]!.partNumber) {
        return jsonResponse(400, { error: 'parts must be sorted by partNumber and unique' });
      }
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

    const completedEtag = await completeMultipartUpload({
      key: parsed.data.objectKey,
      uploadId: parsed.data.uploadId,
      parts: parsed.data.parts
    });

    if (!(await objectExists(parsed.data.objectKey))) {
      return jsonResponse(409, { error: 'Object not found in S3 after completion' });
    }

    const contentHash = await computeObjectSha256Hex(parsed.data.objectKey);
    if (isMediaDockspaceType(dockspaceType)) {
      const duplicate = await findActiveMediaFileByContentHash(userId, dockspaceId, contentHash);

      if (duplicate) {
        await deleteObjectIfExists(parsed.data.objectKey);

        return jsonResponse(409, {
          error: 'Upload skipped due to duplicate',
          code: 'UPLOAD_SKIPPED_DUPLICATE',
          duplicateType: 'CONTENT_HASH',
          fullPath,
          reason: 'A media file with identical content already exists.'
        });
      }
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
      contentHash,
      etag: completedEtag ?? parsed.data.parts[parsed.data.parts.length - 1]!.etag,
      nowIso: now
    });
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
