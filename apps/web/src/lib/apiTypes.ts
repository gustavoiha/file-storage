export type DockspaceType = 'GENERIC_FILES' | 'PHOTOS_VIDEOS';

export interface Dockspace {
  dockspaceId: string;
  name: string;
  dockspaceType: DockspaceType;
  createdAt: string;
  totalFileCount: number;
  totalSizeBytes: number;
  lastUploadAt?: string;
}

export interface AlbumRecord {
  albumId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  mediaCount?: number;
}

export interface MediaFileRecord {
  fileNodeId: string;
  fullPath: string;
  size: number;
  contentType: string;
  contentHash: string;
  thumbnail?: {
    url: string;
    contentType: string;
    width?: number;
    height?: number;
  };
  updatedAt: string;
  state: 'ACTIVE';
}

export interface MediaDuplicateGroupRecord {
  contentHash: string;
  items: MediaFileRecord[];
  duplicateCount: number;
  totalGroupSizeBytes: number;
  reclaimableBytes: number;
  defaultKeeperFileNodeId: string;
}

export interface MediaDuplicatesResponse {
  items: MediaDuplicateGroupRecord[];
  summary: {
    groupCount: number;
    duplicateItemCount: number;
    reclaimableBytes: number;
  };
  nextCursor?: string;
}

export interface FileRecord {
  fileNodeId?: string;
  fullPath: string;
  size?: number;
  contentType?: string;
  contentHash?: string;
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
