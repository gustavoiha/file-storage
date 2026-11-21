import { normalizeFullPath } from '../domain/path.js';
import { fileStateFromNode, type FileNodeItem } from '../types/models.js';
import {
  findFileNodeById,
  findTrashedFilesByFullPath,
  fullPathForTrashedFileNode
} from './repository.js';

export type TrashedFileTarget =
  | { status: 'found'; fileNode: FileNodeItem }
  | { status: 'not-found' }
  | { status: 'ambiguous'; matchCount: number };

export const AMBIGUOUS_TRASHED_FILE_ERROR =
  'More than one trashed file has this path; include fileNodeId to choose one';

export const fileNodeIdFromFileNode = (fileNode: FileNodeItem): string =>
  fileNode.SK.startsWith('L#') ? fileNode.SK.slice(2) : fileNode.SK;

/**
 * Picks the one trashed file a purge or restore request acts on.
 *
 * - With `fileNodeId`: that file node only, and only while it is in the trash at `fullPath`.
 *   Other trashed copies with the same path are never touched.
 * - Without `fileNodeId` (older clients): the single trashed file at `fullPath`. When several
 *   trashed files share the path the request is ambiguous and nothing is acted on.
 */
export const resolveTrashedFileTarget = async (params: {
  userId: string;
  dockspaceId: string;
  fullPath: string;
  fileNodeId?: string | undefined;
}): Promise<TrashedFileTarget> => {
  const fullPath = normalizeFullPath(params.fullPath);

  if (params.fileNodeId) {
    const fileNode = await findFileNodeById(params.userId, params.dockspaceId, params.fileNodeId);
    if (!fileNode || fileStateFromNode(fileNode) !== 'TRASH') {
      return { status: 'not-found' };
    }

    const trashedPath = await fullPathForTrashedFileNode(params.userId, params.dockspaceId, fileNode);
    if (normalizeFullPath(trashedPath) !== fullPath) {
      return { status: 'not-found' };
    }

    return { status: 'found', fileNode };
  }

  const matches = await findTrashedFilesByFullPath(params.userId, params.dockspaceId, fullPath);
  const [onlyMatch] = matches;
  if (!onlyMatch) {
    return { status: 'not-found' };
  }

  if (matches.length > 1) {
    return { status: 'ambiguous', matchCount: matches.length };
  }

  return { status: 'found', fileNode: onlyMatch };
};
