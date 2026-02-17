import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { ensureMediaDockspace } from '../lib/dockspaceTypeGuards.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { fullPathFromFileNode, listFileNodes } from '../lib/repository.js';
import { fileStateFromNode, isMediaContentType } from '../types/models.js';

const fileNodeIdFromSk = (sk: string): string => sk.replace(/^L#/, '');

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const dockspaceId = event.pathParameters?.dockspaceId;

    if (!dockspaceId) {
      return jsonResponse(400, { error: 'dockspaceId is required' });
    }

    const mediaDockspace = await ensureMediaDockspace(userId, dockspaceId);
    if (!mediaDockspace.ok) {
      return jsonResponse(mediaDockspace.statusCode, { error: mediaDockspace.error });
    }

    const fileNodes = await listFileNodes(userId, dockspaceId);
    const activeMediaNodes = fileNodes.filter(
      (fileNode) =>
        fileStateFromNode(fileNode) === 'ACTIVE' && isMediaContentType(fileNode.contentType)
    );
    const items = await Promise.all(
      activeMediaNodes.map(async (fileNode) => ({
        fileNodeId: fileNodeIdFromSk(fileNode.SK),
        fullPath: await fullPathFromFileNode(userId, dockspaceId, fileNode),
        size: fileNode.size,
        contentType: fileNode.contentType,
        ...(fileNode.contentHash ? { contentHash: fileNode.contentHash } : {}),
        updatedAt: fileNode.updatedAt,
        state: 'ACTIVE' as const
      }))
    );

    items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return jsonResponse(200, { items });
  } catch (error) {
    return errorResponse(error);
  }
};
