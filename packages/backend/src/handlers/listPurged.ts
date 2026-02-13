import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { fullPathForTrashedFileNode, listPurgedFileNodes } from '../lib/repository.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const dockspaceId = event.pathParameters?.dockspaceId;

    if (!dockspaceId) {
      return jsonResponse(400, { error: 'dockspaceId is required' });
    }

    const files = await listPurgedFileNodes(userId, dockspaceId);

    const items = await Promise.all(
      files.map(async (file) => ({
        fullPath: await fullPathForTrashedFileNode(userId, dockspaceId, file),
        purgedAt: file.purgedAt,
        state: 'PURGED' as const
      }))
    );

    return jsonResponse(200, { items });
  } catch (error) {
    return errorResponse(error);
  }
};
