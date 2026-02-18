import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { ensureMediaDockspace } from '../lib/dockspaceTypeGuards.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import {
  findFileNodeById,
  fullPathFromFileNode,
  getAlbumById,
  listAlbumMemberships,
  listThumbnailMetadata
} from '../lib/repository.js';
import { createDownloadUrl } from '../lib/s3.js';
import type { FileNodeItem } from '../types/models.js';
import { fileStateFromNode, isMediaContentType } from '../types/models.js';

const fileNodeIdFromSk = (sk: string): string => sk.replace(/^L#/, '');

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const dockspaceId = event.pathParameters?.dockspaceId;
    const albumId = event.pathParameters?.albumId;

    if (!dockspaceId) {
      return jsonResponse(400, { error: 'dockspaceId is required' });
    }

    if (!albumId) {
      return jsonResponse(400, { error: 'albumId is required' });
    }

    const mediaDockspace = await ensureMediaDockspace(userId, dockspaceId);
    if (!mediaDockspace.ok) {
      return jsonResponse(mediaDockspace.statusCode, { error: mediaDockspace.error });
    }

    const album = await getAlbumById(userId, dockspaceId, albumId);
    if (!album) {
      return jsonResponse(404, { error: 'Album not found' });
    }

    const memberships = await listAlbumMemberships(userId, dockspaceId, albumId);
    const fileNodes = await Promise.all(
      memberships.map((membership) => findFileNodeById(userId, dockspaceId, membership.fileNodeId))
    );
    const activeMediaNodes = fileNodes.filter((fileNode): fileNode is FileNodeItem => {
      if (!fileNode) {
        return false;
      }

      return fileStateFromNode(fileNode) === 'ACTIVE' && isMediaContentType(fileNode.contentType);
    });

    const baseItems = await Promise.all(
      activeMediaNodes.map(async (fileNode) => ({
        fileNodeId: fileNodeIdFromSk(fileNode.SK),
        fullPath: await fullPathFromFileNode(userId, dockspaceId, fileNode),
        size: fileNode.size,
        contentType: fileNode.contentType,
        contentHash: fileNode.contentHash,
        updatedAt: fileNode.updatedAt,
        state: 'ACTIVE' as const
      }))
    );
    const thumbnailMetadataItems = await listThumbnailMetadata(userId, dockspaceId);
    const thumbnailByFileNodeId = new Map(
      thumbnailMetadataItems.map((item) => [item.fileNodeId, item] as const)
    );
    const items = await Promise.all(
      baseItems.map(async (item) => {
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

    items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return jsonResponse(200, { items });
  } catch (error) {
    return errorResponse(error);
  }
};
