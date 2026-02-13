import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { normalizeFolderPath, normalizeFullPath } from '../domain/path.js';
import { env } from '../lib/env.js';
import { errorResponse, isoPlusDays, jsonResponse, safeJsonParse } from '../lib/http.js';
import { fileStateFromNode } from '../types/models.js';
import {
  buildRecursiveFolderTrashPlan,
  deleteFolderNodeItems,
  deleteDirectoryItems,
  markResolvedFileNodeTrashed,
  resolveFileByFullPath,
  resolveFolderByPath
} from '../lib/repository.js';
import { tagObjectTrash } from '../lib/s3.js';

const bodySchema = z.object({
  fullPath: z.string().trim().min(2),
  targetType: z.enum(['file', 'folder']).optional()
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

    const targetType = parsed.data.targetType ?? 'file';
    const now = new Date().toISOString();
    const flaggedForDeleteAt = isoPlusDays(now, env.trashRetentionDays);

    if (targetType === 'file') {
      const fullPath = normalizeFullPath(parsed.data.fullPath);
      const resolved = await resolveFileByFullPath(userId, dockspaceId, fullPath);

      if (!resolved || fileStateFromNode(resolved.fileNode) !== 'ACTIVE') {
        return jsonResponse(404, { error: 'Active file not found' });
      }

      const objectKey = resolved.fileNode.s3Key;

      await markResolvedFileNodeTrashed(userId, dockspaceId, resolved, now, flaggedForDeleteAt);
      await tagObjectTrash(objectKey);

      return jsonResponse(200, {
        targetType: 'file',
        fullPath,
        state: 'TRASH',
        flaggedForDeleteAt,
        trashedFilesCount: 1
      });
    }

    const folderPath = normalizeFolderPath(parsed.data.fullPath);
    if (folderPath === '/') {
      return jsonResponse(400, { error: 'Root folder cannot be moved to trash' });
    }

    const resolvedFolder = await resolveFolderByPath(userId, dockspaceId, folderPath);
    if (!resolvedFolder) {
      return jsonResponse(404, { error: 'Active folder not found' });
    }

    const trashPlan = await buildRecursiveFolderTrashPlan(userId, dockspaceId, resolvedFolder);

    for (const resolvedFile of trashPlan.files) {
      await markResolvedFileNodeTrashed(userId, dockspaceId, resolvedFile, now, flaggedForDeleteAt);
      await tagObjectTrash(resolvedFile.fileNode.s3Key);
    }

    await deleteDirectoryItems(userId, dockspaceId, trashPlan.folderDirectories);
    await deleteFolderNodeItems(userId, dockspaceId, trashPlan.folderNodeIds);

    return jsonResponse(200, {
      targetType: 'folder',
      folderPath,
      state: 'TRASH',
      flaggedForDeleteAt,
      trashedFilesCount: trashPlan.files.length,
      trashedFoldersCount: trashPlan.folderDirectories.length
    });
  } catch (error) {
    return errorResponse(error);
  }
};
