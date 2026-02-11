import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { fullPathFromFileNode, listTrashedFileNodes } from '../lib/repository.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const vaultId = event.pathParameters?.vaultId;

    if (!vaultId) {
      return jsonResponse(400, { error: 'vaultId is required' });
    }

    const files = await listTrashedFileNodes(userId, vaultId);

    const items = await Promise.all(
      files.map(async (file) => ({
        fullPath: await fullPathFromFileNode(userId, vaultId, file),
        size: file.size,
        deletedAt: file.deletedAt,
        flaggedForDeleteAt: file.flaggedForDeleteAt,
        state: 'TRASH' as const
      }))
    );

    return jsonResponse(200, { items });
  } catch (error) {
    return errorResponse(error);
  }
};
