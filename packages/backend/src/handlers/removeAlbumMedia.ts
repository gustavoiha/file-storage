import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { ensureMediaDockspace } from '../lib/dockspaceTypeGuards.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { getAlbumById, removeAlbumMembership } from '../lib/repository.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const dockspaceId = event.pathParameters?.dockspaceId;
    const albumId = event.pathParameters?.albumId;
    const fileNodeId = event.pathParameters?.fileNodeId;

    if (!dockspaceId) {
      return jsonResponse(400, { error: 'dockspaceId is required' });
    }

    if (!albumId) {
      return jsonResponse(400, { error: 'albumId is required' });
    }

    if (!fileNodeId) {
      return jsonResponse(400, { error: 'fileNodeId is required' });
    }

    const mediaDockspace = await ensureMediaDockspace(userId, dockspaceId);
    if (!mediaDockspace.ok) {
      return jsonResponse(mediaDockspace.statusCode, { error: mediaDockspace.error });
    }

    const album = await getAlbumById(userId, dockspaceId, albumId);
    if (!album) {
      return jsonResponse(404, { error: 'Album not found' });
    }

    await removeAlbumMembership({
      userId,
      dockspaceId,
      albumId,
      fileNodeId
    });

    return jsonResponse(200, {
      albumId,
      fileNodeId,
      removed: true
    });
  } catch (error) {
    return errorResponse(error);
  }
};
