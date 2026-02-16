export interface Dockspace {
  dockspaceId: string;
  name: string;
  createdAt: string;
  totalFileCount: number;
  totalSizeBytes: number;
  lastUploadAt?: string;
}

export interface FileRecord {
  fileNodeId?: string;
  fullPath: string;
  size?: number;
  contentType?: string;
  updatedAt?: string;
  deletedAt?: string;
  flaggedForDeleteAt?: string;
  purgedAt?: string;
  state?: 'ACTIVE' | 'TRASH' | 'PURGED';
}

export interface FolderRecord {
  folderNodeId: string;
  parentFolderNodeId: string;
  fullPath: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface DirectoryChildRecord {
  childId: string;
  childType: 'file' | 'folder';
  name: string;
  normalizedName: string;
  parentFolderNodeId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DirectoryChildrenRecord {
  parentFolderNodeId: string;
  items: DirectoryChildRecord[];
}
