import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { normalizeFolderPath } from '../domain/path.js';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { renameFolderByPath } from '../lib/repository.js';

const bodySchema = z.object({
  folderPath: z.string().trim().min(1),
  newName: z.string().trim().min(1)
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
      return jsonResponse(400, { error: 'Root folder cannot be renamed' });
    }

    const newName = parsed.data.newName.trim();
    if (newName.includes('/')) {
      return jsonResponse(400, { error: 'newName cannot include path separators' });
    }

    const now = new Date().toISOString();
    const result = await renameFolderByPath({
      userId,
      vaultId,
      folderPath,
      newName,
      nowIso: now
    });

    if (result.status === 'NOT_FOUND') {
      return jsonResponse(404, { error: 'Folder not found' });
    }

    if (result.status === 'CONFLICT') {
      return jsonResponse(409, {
        error: 'A folder with this name already exists in the parent folder'
      });
    }

    return jsonResponse(200, {
      folderPath: result.folderPath,
      renamed: result.status === 'RENAMED',
      updatedAt: now
    });
  } catch (error) {
    return errorResponse(error);
  }
};
