import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { ensureMediaDockspace } from '../lib/dockspaceTypeGuards.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { listActiveMediaItems, listThumbnailMetadata } from '../lib/repository.js';
import { createDownloadUrl } from '../lib/s3.js';

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

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
    const [mediaPage, thumbnailMetadataItems] = await Promise.all([
      listActiveMediaItems({
        userId,
        dockspaceId,
        ...(cursor ? { cursor } : {}),
        limit
      }),
      listThumbnailMetadata(userId, dockspaceId)
    ]);
    const thumbnailByFileNodeId = new Map(
      thumbnailMetadataItems.map((item) => [item.fileNodeId, item] as const)
    );
    const itemsWithThumbnails = await Promise.all(
      mediaPage.items.map(async (item) => {
        const thumbnailMetadata = thumbnailByFileNodeId.get(item.fileNodeId);
        if (
          !thumbnailMetadata ||
          thumbnailMetadata.status !== 'READY' ||
          !thumbnailMetadata.thumbnailKey
        ) {
          return item;
        }

        return {
          ...item,
          thumbnail: {
            url: await createDownloadUrl(thumbnailMetadata.thumbnailKey),
            contentType: thumbnailMetadata.thumbnailContentType ?? 'image/jpeg',
            ...(typeof thumbnailMetadata.width === 'number'
              ? { width: thumbnailMetadata.width }
              : {}),
            ...(typeof thumbnailMetadata.height === 'number'
              ? { height: thumbnailMetadata.height }
              : {})
          }
        };
      })
    );

    return jsonResponse(200, {
      items: itemsWithThumbnails,
      ...(mediaPage.nextCursor ? { nextCursor: mediaPage.nextCursor } : {})
    });
  } catch (error) {
    return errorResponse(error);
  }
};
