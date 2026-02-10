import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { normalizeFolderPath } from '../domain/path.js';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { upsertFolderByPath } from '../lib/repository.js';

const bodySchema = z.object({
  folderPath: z.string().trim().min(1)
});

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const vaultId = event.pathParameters?.vaultId;

    if (!vaultId) {
      return jsonResponse(400, { error: 'vaultId is required' });
    }

    const parsed = bodySchema.safeParse(safeJsonParse(event.body));
    if (!parsed.success) {
      return jsonResponse(400, { error: 'Invalid request body' });
    }

    const folderPath = normalizeFolderPath(parsed.data.folderPath);
    if (folderPath === '/') {
      return jsonResponse(400, { error: 'Root folder cannot be created' });
    }

    const now = new Date().toISOString();
    const result = await upsertFolderByPath({
      userId,
      vaultId,
      folderPath,
      nowIso: now
    });

    return jsonResponse(result.created ? 201 : 200, {
      folderPath: result.folderPath,
      folderNodeId: result.folderNodeId,
      created: result.created
    });
  } catch (error) {
    return errorResponse(error);
  }
};
