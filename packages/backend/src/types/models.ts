export type FileState = 'ACTIVE' | 'TRASH' | 'PURGED';
export const DOCKSPACE_TYPES = ['GENERIC_FILES', 'PHOTOS_VIDEOS'] as const;
export type DockspaceType = (typeof DOCKSPACE_TYPES)[number];
export const DEFAULT_DOCKSPACE_TYPE: DockspaceType = 'GENERIC_FILES';

export interface FileNodeItem {
  PK: string;
  SK: string;
  type: 'FILE_NODE';
  parentFolderNodeId: string;
  s3Key: string;
  name: string;
  contentHash: string;
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
  dockspaceType?: DockspaceType;
  features?: Record<string, boolean>;
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

export interface AlbumItem {
  PK: string;
  SK: string;
  type: 'ALBUM';
  albumId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlbumMembershipItem {
  PK: string;
  SK: string;
  type: 'ALBUM_MEMBERSHIP';
  albumId: string;
  fileNodeId: string;
  createdAt: string;
}

export interface MediaAlbumLinkItem {
  PK: string;
  SK: string;
  type: 'MEDIA_ALBUM_LINK';
  albumId: string;
  fileNodeId: string;
  createdAt: string;
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

export const dockspaceTypeFromItem = (
  dockspace: Pick<DockspaceItem, 'dockspaceType'>
): DockspaceType =>
  dockspace.dockspaceType === 'PHOTOS_VIDEOS' ? 'PHOTOS_VIDEOS' : DEFAULT_DOCKSPACE_TYPE;

export const isMediaDockspaceType = (dockspaceType: DockspaceType): boolean =>
  dockspaceType === 'PHOTOS_VIDEOS';

export const isMediaContentType = (contentType: string): boolean => {
  const normalized = contentType.trim().toLowerCase();
  return normalized.startsWith('image/') || normalized.startsWith('video/');
};

export type TableItem =
  | FileNodeItem
  | FolderNodeItem
  | DirectoryItem
  | DockspaceItem
  | DockspaceMetricsItem
  | FileStateIndexItem
  | AlbumItem
  | AlbumMembershipItem
  | MediaAlbumLinkItem;
