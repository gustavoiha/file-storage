export const ROOT_FOLDER_NODE_ID = 'root';

export type DirectoryKind = 'L' | 'F';

export const buildVaultPartitionSk = (userId: string, vaultId: string): string =>
  `U#${userId}#V#${vaultId}`;

export const buildFilePk = (userId: string, vaultId: string): string =>
  buildVaultPartitionSk(userId, vaultId);

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

export const buildVaultPk = (userId: string): string => `U#${userId}`;

export const buildVaultSk = (vaultId: string): string => `V#${vaultId}`;
