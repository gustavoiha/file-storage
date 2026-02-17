import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { ensureMediaDockspace } from '../lib/dockspaceTypeGuards.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { createAlbum } from '../lib/repository.js';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100)
});

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

    const parsed = bodySchema.safeParse(safeJsonParse(event.body));
    if (!parsed.success) {
      return jsonResponse(400, { error: 'Invalid request body' });
    }

    const nowIso = new Date().toISOString();
    const album = await createAlbum({
      userId,
      dockspaceId,
      albumId: randomUUID(),
      name: parsed.data.name,
      nowIso
    });

    return jsonResponse(201, {
      albumId: album.albumId,
      name: album.name,
      createdAt: album.createdAt,
      updatedAt: album.updatedAt
    });
  } catch (error) {
    return errorResponse(error);
  }
};
