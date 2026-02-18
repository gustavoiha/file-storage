export const ROOT_FOLDER_NODE_ID = 'root';
export const PURGE_DUE_GSI1_PK = 'PURGE_DUE';

export type DirectoryKind = 'L' | 'F';

export const buildDockspacePartitionSk = (userId: string, dockspaceId: string): string =>
  `U#${userId}#S#${dockspaceId}`;

export const buildFilePk = (userId: string, dockspaceId: string): string =>
  buildDockspacePartitionSk(userId, dockspaceId);

export const buildFileNodeSk = (fileNodeId: string): string => `L#${fileNodeId}`;

export const buildFolderNodeSk = (folderNodeId: string): string => `F#${folderNodeId}`;

export const buildDirectorySk = (
  folderNodeId: string,
  kind: DirectoryKind,
  normalizedName: string,
  id: string
): string => `D#${folderNodeId}#${kind}#${normalizedName}#${id}`;

export const buildDirectoryPrefix = (
  folderNodeId: string,
  kind?: DirectoryKind
): string => (kind ? `D#${folderNodeId}#${kind}#` : `D#${folderNodeId}#`);

export const buildDirectoryNamePrefix = (
  folderNodeId: string,
  kind: DirectoryKind,
  normalizedName: string
): string => `D#${folderNodeId}#${kind}#${normalizedName}#`;

export const buildDockspacePk = (userId: string): string => `U#${userId}`;

export const buildDockspaceSk = (dockspaceId: string): string => `S#${dockspaceId}`;

export const buildDockspaceMetricsSk = (dockspaceId: string): string => `M#S#${dockspaceId}`;
export const buildDockspaceMetricsPrefix = (): string => 'M#S#';
export const buildAlbumSk = (albumId: string): string => `A#${albumId}`;
export const buildAlbumPrefix = (): string => 'A#';
export const buildAlbumMembershipSk = (albumId: string, fileNodeId: string): string =>
  `AM#${albumId}#L#${fileNodeId}`;
export const buildAlbumMembershipPrefix = (albumId: string): string => `AM#${albumId}#L#`;
export const buildMediaAlbumLinkSk = (fileNodeId: string, albumId: string): string =>
  `MA#${fileNodeId}#A#${albumId}`;
export const buildMediaAlbumLinkPrefix = (fileNodeId: string): string => `MA#${fileNodeId}#A#`;
export const buildThumbnailMetadataSk = (fileNodeId: string): string => `T#L#${fileNodeId}`;
export const buildThumbnailMetadataPrefix = (): string => 'T#L#';
export const buildMediaHashIndexSk = (contentHash: string, fileNodeId: string): string =>
  `H#${contentHash}#L#${fileNodeId}`;
export const buildMediaHashIndexPrefix = (contentHash?: string): string =>
  contentHash ? `H#${contentHash}#L#` : 'H#';

export const buildPurgeDueGsi1Sk = (
  flaggedForDeleteAt: string,
  filePk: string,
  fileNodeSk: string
): string => `${flaggedForDeleteAt}#${filePk}#${fileNodeSk}`;

export type FileStateIndexKind = 'TRASH' | 'PURGED';

export const buildFileStateIndexSk = (
  kind: FileStateIndexKind,
  timestampIso: string,
  fileNodeId: string
): string => `X#${kind}#${timestampIso}#${fileNodeId}`;

export const buildFileStateIndexPrefix = (kind: FileStateIndexKind): string => `X#${kind}#`;

export const buildPurgeDueUpperBoundGsi1Sk = (nowIso: string): string => `${nowIso}#~`;

export const parseDockspacePartitionSk = (
  filePk: string
): { userId: string; dockspaceId: string } | null => {
  if (!filePk.startsWith('U#')) {
    return null;
  }

  const separatorIndex = filePk.indexOf('#S#', 2);
  if (separatorIndex < 0) {
    return null;
  }

  const userId = filePk.slice(2, separatorIndex);
  const dockspaceId = filePk.slice(separatorIndex + 3);

  if (!userId || !dockspaceId) {
    return null;
  }

  return { userId, dockspaceId };
};
