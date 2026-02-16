import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { normalizeFullPath } from '../domain/path.js';
import { listPurgedFileStateIndex } from '../lib/repository.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const dockspaceId = event.pathParameters?.dockspaceId;

    if (!dockspaceId) {
      return jsonResponse(400, { error: 'dockspaceId is required' });
    }

    const stateItems = await listPurgedFileStateIndex(userId, dockspaceId);

    const items = stateItems
      .filter((item) => Boolean(item.trashedPath))
      .map((item) => ({
        fullPath: normalizeFullPath(item.trashedPath ?? '/'),
        purgedAt: item.purgedAt,
        state: 'PURGED' as const
      }));

    return jsonResponse(200, { items });
  } catch (error) {
    return errorResponse(error);
  }
};
