import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { ensureMediaDockspace } from '../lib/dockspaceTypeGuards.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { listMediaDuplicateGroups } from '../lib/repository.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const parseLimit = (rawLimit: string | undefined): number => {
  if (!rawLimit) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
};

const parseCursor = (rawCursor: string | undefined): string | undefined => {
  const normalized = rawCursor?.trim();
  return normalized ? normalized : undefined;
};

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

    const limit = parseLimit(event.queryStringParameters?.limit);
    const cursor = parseCursor(event.queryStringParameters?.cursor);
    const result = await listMediaDuplicateGroups({
      userId,
      dockspaceId,
      ...(cursor ? { cursor } : {}),
      limit
    });

    return jsonResponse(200, {
      items: result.items,
      summary: result.summary,
      ...(result.nextCursor ? { nextCursor: result.nextCursor } : {})
    });
  } catch (error) {
    return errorResponse(error);
  }
};
