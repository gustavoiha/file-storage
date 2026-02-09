import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { toFolderPrefix } from '../domain/path.js';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { listFilesByState } from '../lib/repository.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const vaultId = event.pathParameters?.vaultId;
    const folder = event.queryStringParameters?.folder ?? '/';

    if (!vaultId) {
      return jsonResponse(400, { error: 'vaultId is required' });
    }

    const prefix = folder === '/' ? '/' : toFolderPrefix(folder);
    const files = await listFilesByState(userId, vaultId, 'ACTIVE', prefix);

    return jsonResponse(200, {
      items: files.map((file) => ({
        fullPath: file.fullPath,
        size: file.size,
        contentType: file.contentType,
        updatedAt: file.updatedAt,
        state: file.state
      }))
    });
  } catch (error) {
    return errorResponse(error);
  }
};
