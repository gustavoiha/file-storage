import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { findDownloadableFileByNodeId } from '../lib/repository.js';
import { createDownloadUrl, objectExists } from '../lib/s3.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const vaultId = event.pathParameters?.vaultId;
    const fileNodeId = event.pathParameters?.fileNodeId?.trim();

    if (!vaultId) {
      return jsonResponse(400, { error: 'vaultId is required' });
    }

    if (!fileNodeId || fileNodeId.includes('/')) {
      return jsonResponse(400, { error: 'fileNodeId is required' });
    }

    const fileNode = await findDownloadableFileByNodeId(userId, vaultId, fileNodeId);
    if (!fileNode) {
      return jsonResponse(404, { error: 'Downloadable file not found' });
    }

    if (!(await objectExists(fileNode.s3Key))) {
      return jsonResponse(409, { error: 'Object not found in storage' });
    }

    const disposition = event.queryStringParameters?.disposition;
    const asAttachment = disposition === 'attachment';
    const downloadUrl = await createDownloadUrl(fileNode.s3Key, {
      asAttachment,
      fileName: fileNode.name
    });

    return jsonResponse(200, {
      downloadUrl,
      contentType: fileNode.contentType,
      fileName: fileNode.name,
      size: fileNode.size,
      expiresInSeconds: 900
    });
  } catch (error) {
    return errorResponse(error);
  }
};
