import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import {
  getFileNodeSizesByIds,
  listDirectoryChildrenByParentFolderNodeId
} from '../lib/repository.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const dockspaceId = event.pathParameters?.dockspaceId;
    const parentFolderNodeId = event.pathParameters?.parentFolderNodeId;

    if (!dockspaceId) {
      return jsonResponse(400, { error: 'dockspaceId is required' });
    }

    if (!parentFolderNodeId) {
      return jsonResponse(400, { error: 'parentFolderNodeId is required' });
    }

    const items = await listDirectoryChildrenByParentFolderNodeId(
      userId,
      dockspaceId,
      parentFolderNodeId
    );

    const fileSizes = await getFileNodeSizesByIds(
      userId,
      dockspaceId,
      items.filter((item) => item.childType === 'file').map((item) => item.childId)
    );

    return jsonResponse(200, {
      parentFolderNodeId,
      items: items.map((item) => {
        const size = item.childType === 'file' ? fileSizes.get(item.childId) : undefined;
        return {
          childId: item.childId,
          childType: item.childType,
          name: item.name,
          normalizedName: item.normalizedName,
          parentFolderNodeId: item.parentFolderNodeId,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          ...(size !== undefined ? { size } : {})
        };
      })
    });
  } catch (error) {
    return errorResponse(error);
  }
};
