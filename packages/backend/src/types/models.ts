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
  trashedPath?: string;
  purgedAt?: string;
  GSI1PK?: string;
  GSI1SK?: string;
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

export interface DockspaceItem {
  PK: string;
  SK: string;
  type: 'DOCKSPACE';
  userId: string;
  dockspaceId: string;
  name: string;
  createdAt: string;
}

export interface DockspaceMetricsItem {
  PK: string;
  SK: string;
  type: 'DOCKSPACE_METRICS';
  dockspaceId: string;
  totalFileCount: number;
  totalSizeBytes: number;
  lastUploadAt?: string;
  updatedAt: string;
}

export interface FileStateIndexItem {
  PK: string;
  SK: string;
  type: 'FILE_STATE_INDEX';
  state: Exclude<FileState, 'ACTIVE'>;
  fileNodeId: string;
  trashedPath?: string;
  size?: number;
  deletedAt?: string;
  flaggedForDeleteAt?: string;
  purgedAt?: string;
  updatedAt: string;
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

export type TableItem =
  | FileNodeItem
  | FolderNodeItem
  | DirectoryItem
  | DockspaceItem
  | DockspaceMetricsItem
  | FileStateIndexItem;
