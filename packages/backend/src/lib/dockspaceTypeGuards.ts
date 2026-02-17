import { getDockspaceById } from './repository.js';
import type { DockspaceItem } from '../types/models.js';
import { dockspaceTypeFromItem, isMediaDockspaceType } from '../types/models.js';

type MediaDockspaceGuardResult =
  | { ok: true; dockspace: DockspaceItem }
  | { ok: false; statusCode: number; error: string };

export const ensureMediaDockspace = async (
  userId: string,
  dockspaceId: string
): Promise<MediaDockspaceGuardResult> => {
  const dockspace = await getDockspaceById(userId, dockspaceId);
  if (!dockspace) {
    return {
      ok: false,
      statusCode: 404,
      error: 'Dockspace not found'
    };
  }

  if (!isMediaDockspaceType(dockspaceTypeFromItem(dockspace))) {
    return {
      ok: false,
      statusCode: 409,
      error: 'Albums are only supported for PHOTOS_VIDEOS dockspaces'
    };
  }

  return {
    ok: true,
    dockspace
  };
};
