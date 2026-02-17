import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { listDockspaceMetrics, listDockspaces } from '../lib/repository.js';
import { dockspaceTypeFromItem } from '../types/models.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const [dockspaces, dockspaceMetrics] = await Promise.all([
      listDockspaces(userId),
      listDockspaceMetrics(userId)
    ]);
    const metricsByDockspaceId = new Map(
      dockspaceMetrics.map((item) => [item.dockspaceId, item])
    );

    return jsonResponse(200, {
      items: dockspaces.map((dockspace) => {
        const metrics = metricsByDockspaceId.get(dockspace.dockspaceId);

        return {
          dockspaceId: dockspace.dockspaceId,
          name: dockspace.name,
          dockspaceType: dockspaceTypeFromItem(dockspace),
          createdAt: dockspace.createdAt,
          totalFileCount: metrics?.totalFileCount ?? 0,
          totalSizeBytes: metrics?.totalSizeBytes ?? 0,
          lastUploadAt: metrics?.lastUploadAt
        };
      })
    });
  } catch (error) {
    return errorResponse(error);
  }
};
