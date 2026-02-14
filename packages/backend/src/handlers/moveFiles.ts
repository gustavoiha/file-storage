import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { ROOT_FOLDER_NODE_ID } from '../domain/keys.js';
import { buildFullPath, normalizeFolderPath, normalizeFullPath } from '../domain/path.js';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import {
  findDirectoryFileByName,
  moveOrRenameActiveFileNode,
  resolveFileByFullPath,
  resolveFolderByPath
} from '../lib/repository.js';
import { fileStateFromNode } from '../types/models.js';

const bodySchema = z.object({
  sourcePaths: z.array(z.string().trim().min(2)).min(1),
  targetFolderPath: z.string().trim().min(1)
});

type MoveFailureCode = 'NOT_FOUND' | 'CONFLICT' | 'INVALID';

interface MoveFailure {
  from: string;
  code: MoveFailureCode;
  error: string;
}

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

    const targetFolderPath = normalizeFolderPath(parsed.data.targetFolderPath);
    const now = new Date().toISOString();
    const moved: Array<{ from: string; to: string }> = [];
    const failed: MoveFailure[] = [];

    const targetFolderNodeId = await (async (): Promise<string | null> => {
      if (targetFolderPath === '/') {
        return ROOT_FOLDER_NODE_ID;
      }

      const resolvedFolder = await resolveFolderByPath(userId, dockspaceId, targetFolderPath);
      return resolvedFolder?.directory.childId ?? null;
    })();

    if (!targetFolderNodeId) {
      return jsonResponse(404, { error: 'Destination folder not found' });
    }

    const uniqueSourcePaths = new Set<string>();
    for (const sourcePath of parsed.data.sourcePaths) {
      try {
        const normalized = normalizeFullPath(sourcePath);
        if (uniqueSourcePaths.has(normalized)) {
          failed.push({
            from: normalized,
            code: 'INVALID',
            error: 'Duplicate source path in request'
          });
          continue;
        }

        uniqueSourcePaths.add(normalized);
      } catch {
        failed.push({
          from: sourcePath,
          code: 'INVALID',
          error: 'Invalid source path'
        });
      }
    }

    for (const sourcePath of uniqueSourcePaths) {
      try {
        const resolvedFile = await resolveFileByFullPath(userId, dockspaceId, sourcePath);
        if (!resolvedFile || fileStateFromNode(resolvedFile.fileNode) !== 'ACTIVE') {
          failed.push({
            from: sourcePath,
            code: 'NOT_FOUND',
            error: 'Active file not found'
          });
          continue;
        }

        const fileNodeId = resolvedFile.fileNode.SK.slice(2);
        const destinationPath = buildFullPath(targetFolderPath, resolvedFile.fileNode.name);

        if (resolvedFile.fileNode.parentFolderNodeId === targetFolderNodeId) {
          moved.push({ from: sourcePath, to: destinationPath });
          continue;
        }

        const conflict = await findDirectoryFileByName(
          userId,
          dockspaceId,
          targetFolderNodeId,
          resolvedFile.fileNode.name
        );

        if (conflict && conflict.childId !== fileNodeId) {
          failed.push({
            from: sourcePath,
            code: 'CONFLICT',
            error: 'A file with this name already exists in the destination folder'
          });
          continue;
        }

        await moveOrRenameActiveFileNode({
          userId,
          dockspaceId,
          fileNode: resolvedFile.fileNode,
          oldParentFolderNodeId: resolvedFile.fileNode.parentFolderNodeId,
          oldName: resolvedFile.fileNode.name,
          newParentFolderNodeId: targetFolderNodeId,
          newName: resolvedFile.fileNode.name,
          nowIso: now
        });

        moved.push({
          from: sourcePath,
          to: destinationPath
        });
      } catch (error) {
        failed.push({
          from: sourcePath,
          code: 'INVALID',
          error: error instanceof Error ? error.message : 'Failed to move file'
        });
      }
    }

    return jsonResponse(200, {
      targetFolderPath,
      moved,
      failed
    });
  } catch (error) {
    return errorResponse(error);
  }
};
