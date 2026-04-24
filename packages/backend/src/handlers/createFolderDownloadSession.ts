import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { Upload } from '@aws-sdk/lib-storage';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { createFileReadUrl } from '../lib/cdn.js';
import {
  getDockspaceById,
  resolveFolderByPath,
  buildRecursiveFolderTrashPlan
} from '../lib/repository.js';
import { getObjectReadStream } from '../lib/s3.js';
import { s3Client } from '../lib/clients.js';
import { env } from '../lib/env.js';
import { createZipStream } from '../lib/zipStream.js';

const MAX_FILE_COUNT = 500;
const MAX_TOTAL_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const COMPRESSION_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50 MB

interface RequestBody {
  folderPath: string;
}

const buildTempZipKey = (dockspaceId: string): string =>
  `_downloads/${dockspaceId}/${randomUUID()}.zip`;

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const dockspaceId = event.pathParameters?.dockspaceId;

    if (!dockspaceId) {
      return jsonResponse(400, { error: 'dockspaceId is required' });
    }

    const body = safeJsonParse<RequestBody>(event.body ?? null);
    if (!body?.folderPath || typeof body.folderPath !== 'string') {
      return jsonResponse(400, { error: 'folderPath is required' });
    }

    const dockspace = await getDockspaceById(userId, dockspaceId);
    if (!dockspace) {
      return jsonResponse(404, { error: 'Dockspace not found' });
    }

    const resolvedFolder = await resolveFolderByPath(userId, dockspaceId, body.folderPath);
    if (!resolvedFolder) {
      return jsonResponse(404, { error: 'Folder not found' });
    }

    const plan = await buildRecursiveFolderTrashPlan(userId, dockspaceId, resolvedFolder);

    if (plan.files.length === 0) {
      return jsonResponse(200, {
        folderName: resolvedFolder.folderNode.name,
        fileCount: 0,
        totalSize: 0,
        downloadUrl: null
      });
    }

    if (plan.files.length > MAX_FILE_COUNT) {
      return jsonResponse(400, {
        error: `Folder contains ${plan.files.length} files, which exceeds the maximum of ${MAX_FILE_COUNT} for download`
      });
    }

    const totalSize = plan.files.reduce((sum, f) => sum + (f.fileNode.size ?? 0), 0);
    if (totalSize > MAX_TOTAL_SIZE_BYTES) {
      return jsonResponse(400, {
        error: `Folder total size exceeds the 2 GB limit for download`
      });
    }

    const folderPrefix = resolvedFolder.folderPath;
    const useCompression = totalSize > COMPRESSION_THRESHOLD_BYTES;

    const zipEntries = plan.files.map((file) => {
      const relativePath = file.fullPath.startsWith(folderPrefix + '/')
        ? file.fullPath.slice(folderPrefix.length + 1)
        : file.fullPath.startsWith(folderPrefix)
          ? file.fullPath.slice(folderPrefix.length)
          : file.fullPath;

      return {
        name: relativePath.replace(/^\//, ''),
        getStream: () => getObjectReadStream(file.fileNode.s3Key)
      };
    });

    const zipStream = createZipStream(zipEntries, {
      compress: useCompression,
      level: 6
    });

    const zipKey = buildTempZipKey(dockspaceId);

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: env.bucketName,
        Key: zipKey,
        Body: zipStream,
        ContentType: 'application/zip'
      }
    });

    await upload.done();

    const signedUrl = await createFileReadUrl(zipKey, {
      asAttachment: true,
      fileName: `${resolvedFolder.folderNode.name}.zip`,
      expiresInSeconds: 900
    });

    return jsonResponse(200, {
      folderName: resolvedFolder.folderNode.name,
      fileCount: plan.files.length,
      totalSize,
      downloadUrl: signedUrl.url,
      expiresInSeconds: signedUrl.expiresInSeconds
    });
  } catch (error) {
    return errorResponse(error);
  }
};
