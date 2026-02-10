import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { fullPathFromS3Key, listPurgedFileNodes } from '../lib/repository.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const vaultId = event.pathParameters?.vaultId;

    if (!vaultId) {
      return jsonResponse(400, { error: 'vaultId is required' });
    }

    const files = await listPurgedFileNodes(userId, vaultId);

    return jsonResponse(200, {
      items: files.map((file) => ({
        fullPath: fullPathFromS3Key(userId, vaultId, file.s3Key),
        purgedAt: file.purgedAt,
        state: 'PURGED'
      }))
    });
  } catch (error) {
    return errorResponse(error);
  }
};
