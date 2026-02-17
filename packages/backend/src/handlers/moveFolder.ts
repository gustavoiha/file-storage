import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { normalizeFolderPath } from '../domain/path.js';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { moveFolderByPath } from '../lib/repository.js';

const bodySchema = z.object({
  sourceFolderPath: z.string().trim().min(1),
  targetFolderPath: z.string().trim().min(1)
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

    const sourceFolderPath = normalizeFolderPath(parsed.data.sourceFolderPath);
    const targetFolderPath = normalizeFolderPath(parsed.data.targetFolderPath);

    if (sourceFolderPath === '/') {
      return jsonResponse(400, { error: 'Root folder cannot be moved' });
    }

    const nowIso = new Date().toISOString();
    const result = await moveFolderByPath({
      userId,
      dockspaceId,
      sourceFolderPath,
      targetFolderPath,
      nowIso
    });

    if (result.status === 'NOT_FOUND') {
      return jsonResponse(404, { error: 'Source or destination folder not found' });
    }

    if (result.status === 'CONFLICT') {
      return jsonResponse(409, {
        error: 'A folder with this name already exists in the destination folder'
      });
    }

    if (result.status === 'INVALID_DESTINATION') {
      return jsonResponse(400, {
        error: 'Invalid folder destination'
      });
    }

    return jsonResponse(200, {
      status: result.status,
      from: result.from,
      to: result.to,
      moved: result.status === 'MOVED',
      updatedAt: nowIso
    });
  } catch (error) {
    return errorResponse(error);
  }
};
