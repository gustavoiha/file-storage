import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { ensureMediaDockspace } from '../lib/dockspaceTypeGuards.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { getAlbumById, renameAlbum } from '../lib/repository.js';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100)
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

    const nowIso = new Date().toISOString();
    await renameAlbum({
      userId,
      dockspaceId,
      albumId,
      name: parsed.data.name,
      nowIso
    });

    return jsonResponse(200, {
      albumId,
      name: parsed.data.name,
      updatedAt: nowIso
    });
  } catch (error) {
    return errorResponse(error);
  }
};
