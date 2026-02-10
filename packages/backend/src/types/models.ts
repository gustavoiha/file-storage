export type FileState = 'ACTIVE' | 'TRASH' | 'PURGED';

export interface FileNodeItem {
  PK: string;
  SK: string;
  type: 'FILE_NODE';
  parentFolderNodeId: string;
  s3Key: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  size: number;
  contentType: string;
  etag: string;
  deletedAt?: string;
  flaggedForDeleteAt?: string;
  purgedAt?: string;
}

export interface FolderNodeItem {
  PK: string;
  SK: string;
  type: 'FOLDER_NODE';
  parentFolderNodeId?: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DirectoryItem {
  PK: string;
  SK: string;
  type: 'DIRECTORY';
  name: string;
  normalizedName: string;
  childId: string;
  childType: 'file' | 'folder';
  parentFolderNodeId: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultItem {
  PK: string;
  SK: string;
  type: 'VAULT';
  userId: string;
  vaultId: string;
  name: string;
  createdAt: string;
}

export const fileStateFromNode = (file: FileNodeItem): FileState => {
  if (file.purgedAt) {
    return 'PURGED';
  }

  if (file.deletedAt) {
    return 'TRASH';
  }

  return 'ACTIVE';
};

export type TableItem = FileNodeItem | FolderNodeItem | DirectoryItem | VaultItem;
