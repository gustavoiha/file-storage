import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { ensureMediaDockspace } from '../lib/dockspaceTypeGuards.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { listAlbumMemberships, listAlbums } from '../lib/repository.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const dockspaceId = event.pathParameters?.dockspaceId;

    if (!dockspaceId) {
      return jsonResponse(400, { error: 'dockspaceId is required' });
    }

    const mediaDockspace = await ensureMediaDockspace(userId, dockspaceId);
    if (!mediaDockspace.ok) {
      return jsonResponse(mediaDockspace.statusCode, { error: mediaDockspace.error });
    }

    const albums = await listAlbums(userId, dockspaceId);
    const items = await Promise.all(
      albums.map(async (album) => {
        const memberships = await listAlbumMemberships(userId, dockspaceId, album.albumId);
        return {
          albumId: album.albumId,
          name: album.name,
          createdAt: album.createdAt,
          updatedAt: album.updatedAt,
          mediaCount: memberships.length
        };
      })
    );

    return jsonResponse(200, { items });
  } catch (error) {
    return errorResponse(error);
  }
};
