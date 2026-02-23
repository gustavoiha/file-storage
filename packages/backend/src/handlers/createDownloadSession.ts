import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { createFileReadUrl } from '../lib/cdn.js';
import { findDownloadableFileByNodeId, getDockspaceById } from '../lib/repository.js';
import { objectExists } from '../lib/s3.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const dockspaceId = event.pathParameters?.dockspaceId;
    const fileNodeId = event.pathParameters?.fileNodeId?.trim();

    if (!dockspaceId) {
      return jsonResponse(400, { error: 'dockspaceId is required' });
    }

    if (!fileNodeId || fileNodeId.includes('/')) {
      return jsonResponse(400, { error: 'fileNodeId is required' });
    }

    const dockspace = await getDockspaceById(userId, dockspaceId);
    if (!dockspace) {
      return jsonResponse(404, { error: 'Dockspace not found' });
    }

    const fileNode = await findDownloadableFileByNodeId(userId, dockspaceId, fileNodeId);
    if (!fileNode) {
      return jsonResponse(404, { error: 'Downloadable file not found' });
    }

    if (!(await objectExists(fileNode.s3Key))) {
      return jsonResponse(409, { error: 'Object not found in storage' });
    }

    const disposition = event.queryStringParameters?.disposition;
    const asAttachment = disposition === 'attachment';
    const signedRead = await createFileReadUrl(fileNode.s3Key, {
      asAttachment,
      fileName: fileNode.name,
      expiresInSeconds: 900
    });

    return jsonResponse(200, {
      downloadUrl: signedRead.url,
      contentType: fileNode.contentType,
      fileName: fileNode.name,
      size: fileNode.size,
      expiresInSeconds: signedRead.expiresInSeconds
    });
  } catch (error) {
    return errorResponse(error);
  }
};
