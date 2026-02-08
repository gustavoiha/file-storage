export interface Vault {
  vaultId: string;
  name: string;
  createdAt: string;
}

export interface FileRecord {
  fullPath: string;
  size: number;
  contentType?: string;
  updatedAt?: string;
  deletedAt?: string;
  flaggedForDeleteAt?: string;
  purgedAt?: string;
  state: 'ACTIVE' | 'TRASH' | 'PURGED';
}
