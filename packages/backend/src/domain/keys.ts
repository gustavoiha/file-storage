export const ROOT_FOLDER_NODE_ID = 'root';

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
