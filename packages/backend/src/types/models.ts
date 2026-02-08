export type FileState = 'ACTIVE' | 'TRASH' | 'PURGED';

export interface FileItem {
  PK: string;
  SK: string;
  type: 'FILE';
  userId: string;
  vaultId: string;
  fullPath: string;
  state: FileState;
  createdAt: string;
  updatedAt: string;
  size: number;
  contentType: string;
  etag: string;
  deletedAt?: string;
  flaggedForDeleteAt?: string;
  purgedAt?: string;
  GSI1PK: string;
  GSI1SK: string;
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

export type TableItem = FileItem | VaultItem;
