import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { buildFullPath, normalizeFullPath } from '../domain/path.js';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import {
  findDirectoryFileByName,
  moveOrRenameActiveFileNode,
  resolveFileByFullPath
} from '../lib/repository.js';
import { fileStateFromNode } from '../types/models.js';

const bodySchema = z.object({
  fullPath: z.string().trim().min(2),
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

    const fullPath = normalizeFullPath(parsed.data.fullPath);
    const newName = parsed.data.newName.trim();

    if (newName.includes('/')) {
      return jsonResponse(400, { error: 'newName cannot include path separators' });
    }

    const resolved = await resolveFileByFullPath(userId, vaultId, fullPath);
    if (!resolved || fileStateFromNode(resolved.fileNode) !== 'ACTIVE') {
      return jsonResponse(404, { error: 'Active file not found' });
    }

    if (resolved.fileNode.name === newName) {
      return jsonResponse(200, {
        fullPath,
        renamed: false
      });
    }

    const fileNodeId = resolved.fileNode.SK.slice(2);
    const conflict = await findDirectoryFileByName(
      userId,
      vaultId,
      resolved.fileNode.parentFolderNodeId,
      newName
    );

    if (conflict && conflict.childId !== fileNodeId) {
      return jsonResponse(409, {
        error: 'A file with this name already exists in the folder'
      });
    }

    const now = new Date().toISOString();
    await moveOrRenameActiveFileNode({
      userId,
      vaultId,
      fileNode: resolved.fileNode,
      oldParentFolderNodeId: resolved.fileNode.parentFolderNodeId,
      oldName: resolved.fileNode.name,
      newParentFolderNodeId: resolved.fileNode.parentFolderNodeId,
      newName,
      nowIso: now
    });

    const renamedPath = buildFullPath(resolved.folderPath, newName);

    return jsonResponse(200, {
      fullPath: renamedPath,
      renamed: true,
      updatedAt: now
    });
  } catch (error) {
    return errorResponse(error);
  }
};
