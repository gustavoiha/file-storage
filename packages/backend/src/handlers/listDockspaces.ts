import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { listDockspaces } from '../lib/repository.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const dockspaces = await listDockspaces(userId);

    return jsonResponse(200, {
      items: dockspaces.map((dockspace) => ({
        dockspaceId: dockspace.dockspaceId,
        name: dockspace.name,
        createdAt: dockspace.createdAt
      }))
    });
  } catch (error) {
    return errorResponse(error);
  }
};
