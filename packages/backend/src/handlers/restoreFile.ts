import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { normalizeFullPath, splitFullPath } from '../domain/path.js';
import {
  findDirectoryFileByName,
  findTrashedFileByFullPath,
  markFileNodePurged,
  restoreFileNodeFromTrash
} from '../lib/repository.js';
import { clearTrashTag, objectExists } from '../lib/s3.js';

const bodySchema = z.object({
  fullPath: z.string().trim().min(2)
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
    const file = await findTrashedFileByFullPath(userId, vaultId, fullPath);

    if (!file) {
      return jsonResponse(404, { error: 'Trashed file not found' });
    }

    const objectKey = file.s3Key;
    const now = new Date().toISOString();

    if (!(await objectExists(objectKey))) {
      await markFileNodePurged({ userId, vaultId, fileNode: file, nowIso: now });
      return jsonResponse(409, {
        error: 'Object already purged from S3',
        state: 'PURGED'
      });
    }

    const { fileName } = splitFullPath(fullPath);
    const conflicting = await findDirectoryFileByName(
      userId,
      vaultId,
      file.parentFolderNodeId,
      fileName
    );

    if (conflicting && conflicting.childId !== file.SK.slice(2)) {
      return jsonResponse(409, {
        error: 'Cannot restore because a file with this name already exists in the folder'
      });
    }

    await restoreFileNodeFromTrash({ userId, vaultId, fileNode: file, nowIso: now });
    await clearTrashTag(objectKey);

    return jsonResponse(200, {
      fullPath,
      state: 'ACTIVE'
    });
  } catch (error) {
    return errorResponse(error);
  }
};
