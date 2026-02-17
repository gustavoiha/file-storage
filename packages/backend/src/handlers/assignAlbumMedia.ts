import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { ensureMediaDockspace } from '../lib/dockspaceTypeGuards.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { assignMediaToAlbum, findFileNodeById, getAlbumById } from '../lib/repository.js';
import { fileStateFromNode, isMediaContentType } from '../types/models.js';

const bodySchema = z.object({
  fileNodeIds: z.array(z.string().trim().min(1)).min(1).max(200)
});

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const dockspaceId = event.pathParameters?.dockspaceId;
    const albumId = event.pathParameters?.albumId;

    if (!dockspaceId) {
      return jsonResponse(400, { error: 'dockspaceId is required' });
    }

    if (!albumId) {
      return jsonResponse(400, { error: 'albumId is required' });
    }

    const mediaDockspace = await ensureMediaDockspace(userId, dockspaceId);
    if (!mediaDockspace.ok) {
      return jsonResponse(mediaDockspace.statusCode, { error: mediaDockspace.error });
    }

    const album = await getAlbumById(userId, dockspaceId, albumId);
    if (!album) {
      return jsonResponse(404, { error: 'Album not found' });
    }

    const parsed = bodySchema.safeParse(safeJsonParse(event.body));
    if (!parsed.success) {
      return jsonResponse(400, { error: 'Invalid request body' });
    }

    const uniqueFileNodeIds = Array.from(new Set(parsed.data.fileNodeIds));
    const fileNodes = await Promise.all(
      uniqueFileNodeIds.map((fileNodeId) => findFileNodeById(userId, dockspaceId, fileNodeId))
    );
    const invalidFileNodeIds: string[] = [];

    for (let index = 0; index < uniqueFileNodeIds.length; index += 1) {
      const fileNodeId = uniqueFileNodeIds[index];
      const fileNode = fileNodes[index];

      if (!fileNodeId) {
        continue;
      }

      if (!fileNode) {
        invalidFileNodeIds.push(fileNodeId);
        continue;
      }

      if (fileStateFromNode(fileNode) !== 'ACTIVE' || !isMediaContentType(fileNode.contentType)) {
        invalidFileNodeIds.push(fileNodeId);
      }
    }

    if (invalidFileNodeIds.length > 0) {
      return jsonResponse(400, {
        error: 'fileNodeIds must reference active media files',
        invalidFileNodeIds
      });
    }

    const nowIso = new Date().toISOString();
    await assignMediaToAlbum({
      userId,
      dockspaceId,
      albumId,
      fileNodeIds: uniqueFileNodeIds,
      nowIso
    });

    return jsonResponse(200, {
      albumId,
      assignedFileNodeIds: uniqueFileNodeIds
    });
  } catch (error) {
    return errorResponse(error);
  }
};
