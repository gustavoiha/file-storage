import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { ensureMediaDockspace } from '../lib/dockspaceTypeGuards.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import {
  findFileNodeById,
  getAlbumById,
  listMediaAlbumLinks
} from '../lib/repository.js';
import { fileStateFromNode, isMediaContentType } from '../types/models.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const dockspaceId = event.pathParameters?.dockspaceId;
    const fileNodeId = event.pathParameters?.fileNodeId;

    if (!dockspaceId) {
      return jsonResponse(400, { error: 'dockspaceId is required' });
    }

    if (!fileNodeId) {
      return jsonResponse(400, { error: 'fileNodeId is required' });
    }

    const mediaDockspace = await ensureMediaDockspace(userId, dockspaceId);
    if (!mediaDockspace.ok) {
      return jsonResponse(mediaDockspace.statusCode, { error: mediaDockspace.error });
    }

    const fileNode = await findFileNodeById(userId, dockspaceId, fileNodeId);
    if (!fileNode || fileStateFromNode(fileNode) !== 'ACTIVE' || !isMediaContentType(fileNode.contentType)) {
      return jsonResponse(404, { error: 'Media file not found' });
    }

    const links = await listMediaAlbumLinks(userId, dockspaceId, fileNodeId);
    const albums = await Promise.all(
      links.map((link) => getAlbumById(userId, dockspaceId, link.albumId))
    );
    const items = albums
      .filter((album): album is NonNullable<(typeof albums)[number]> => Boolean(album))
      .map((album) => ({
        albumId: album.albumId,
        name: album.name,
        createdAt: album.createdAt,
        updatedAt: album.updatedAt
      }));

    items.sort((left, right) => left.name.localeCompare(right.name));

    return jsonResponse(200, { items });
  } catch (error) {
    return errorResponse(error);
  }
};
