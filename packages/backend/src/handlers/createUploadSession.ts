import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { normalizeFullPath, splitFullPath } from '../domain/path.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { buildObjectKey, createUploadUrl } from '../lib/s3.js';
import { getDockspaceById, resolveFileByFullPath } from '../lib/repository.js';
import { dockspaceTypeFromItem, isMediaContentType, isMediaDockspaceType } from '../types/models.js';

const bodySchema = z.object({
  fullPath: z.string().trim().min(2),
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
    }

    const existingFile = await resolveFileByFullPath(userId, dockspaceId, normalizedFullPath);
    const fileNodeId = existingFile?.fileNode.SK.replace(/^L#/, '') ?? randomUUID();
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
