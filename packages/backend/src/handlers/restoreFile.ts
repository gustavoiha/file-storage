import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { normalizeFullPath, splitFullPath } from '../domain/path.js';
import {
  ensureFolderNodeIdByPath,
  findDirectoryFileByName,
  markFileNodePurged,
  restoreFileNodeFromTrash
} from '../lib/repository.js';
import { clearTrashTag, objectExists, objectHasAnyVersion } from '../lib/s3.js';
import {
  AMBIGUOUS_TRASHED_FILE_ERROR,
  fileNodeIdFromFileNode,
  resolveTrashedFileTarget
} from '../lib/trashedFileTarget.js';

const bodySchema = z.object({
  fullPath: z.string().trim().min(2),
  fileNodeId: z.string().trim().min(1).max(200).optional()
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

    const fullPath = normalizeFullPath(parsed.data.fullPath);
    const target = await resolveTrashedFileTarget({
      userId,
      dockspaceId,
      fullPath,
      fileNodeId: parsed.data.fileNodeId
    });
    if (target.status === 'ambiguous') {
      return jsonResponse(409, { error: AMBIGUOUS_TRASHED_FILE_ERROR, state: 'TRASH' });
    }
    if (target.status === 'not-found') {
      return jsonResponse(404, { error: 'Trashed file not found' });
    }

    const file = target.fileNode;
    const fileNodeId = fileNodeIdFromFileNode(file);

    const objectKey = file.s3Key;
    const now = new Date().toISOString();

    if (!(await objectExists(objectKey))) {
      if (await objectHasAnyVersion(objectKey)) {
        return jsonResponse(409, {
          error: 'Object current version is unavailable and cannot be restored',
          state: 'TRASH'
        });
      }

      await markFileNodePurged({ userId, dockspaceId, fileNode: file, nowIso: now });
      return jsonResponse(409, {
        error: 'Object already purged from S3',
        state: 'PURGED'
      });
    }

    const { fileName, folderPath } = splitFullPath(fullPath);
    const parentFolderNodeId = await ensureFolderNodeIdByPath(userId, dockspaceId, folderPath, now);
    const conflicting = await findDirectoryFileByName(userId, dockspaceId, parentFolderNodeId, fileName);

    if (conflicting && conflicting.childId !== fileNodeId) {
      return jsonResponse(409, {
        error: 'Cannot restore because a file with this name already exists in the folder'
      });
    }

    await restoreFileNodeFromTrash({
      userId,
      dockspaceId,
      fileNode: file,
      parentFolderNodeId,
      fileName,
      nowIso: now
    });
    await clearTrashTag(objectKey);

    return jsonResponse(200, {
      fullPath,
      fileNodeId,
      state: 'ACTIVE'
    });
  } catch (error) {
    return errorResponse(error);
  }
};
