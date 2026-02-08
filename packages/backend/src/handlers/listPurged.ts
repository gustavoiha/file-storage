import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getUserIdFromEvent } from '../lib/auth.js';
import { jsonResponse } from '../lib/http.js';
import { listFilesByState } from '../lib/repository.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const userId = getUserIdFromEvent(event);
    const vaultId = event.pathParameters?.vaultId;

    if (!vaultId) {
      return jsonResponse(400, { error: 'vaultId is required' });
    }

    const files = await listFilesByState(userId, vaultId, 'PURGED');

    return jsonResponse(200, {
      items: files.map((file) => ({
        fullPath: file.fullPath,
        purgedAt: file.purgedAt,
        state: file.state
      }))
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
