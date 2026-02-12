import { apiRequest } from './apiClient';
import type { DirectoryChildrenRecord, FileRecord, Dockspace } from './apiTypes';

export const listDockspaces = async (): Promise<Dockspace[]> => {
  const response = await apiRequest<{ items: Dockspace[] }>('/dockspaces');
  return response.items;
};

export const createDockspace = async (name: string): Promise<Dockspace> =>
  apiRequest<Dockspace>('/dockspaces', {
    method: 'POST',
    body: JSON.stringify({ name })
  });

export const listFolderChildren = async (
  dockspaceId: string,
  parentFolderNodeId: string
): Promise<DirectoryChildrenRecord> => {
  const response = await apiRequest<DirectoryChildrenRecord>(
    `/dockspaces/${dockspaceId}/folders/${encodeURIComponent(parentFolderNodeId)}/children`
  );

  return response;
};

export const createFolder = async (
  dockspaceId: string,
  folderPath: string
): Promise<{ folderPath: string; folderNodeId: string; created: boolean }> =>
  apiRequest(`/dockspaces/${dockspaceId}/folders`, {
    method: 'POST',
    body: JSON.stringify({ folderPath })
  });

export const renameFolder = async (
  dockspaceId: string,
  folderPath: string,
  newName: string
): Promise<void> => {
  await apiRequest(`/dockspaces/${dockspaceId}/folders/rename`, {
    method: 'PATCH',
    body: JSON.stringify({ folderPath, newName })
  });
};

export const listTrash = async (dockspaceId: string): Promise<FileRecord[]> => {
  const response = await apiRequest<{ items: FileRecord[] }>(`/dockspaces/${dockspaceId}/trash`);
  return response.items;
};

export const listPurged = async (dockspaceId: string): Promise<FileRecord[]> => {
  const response = await apiRequest<{ items: FileRecord[] }>(`/dockspaces/${dockspaceId}/purged`);
  return response.items;
};

interface UploadSessionResponse {
  uploadUrl: string;
  objectKey: string;
  expiresInSeconds: number;
}

export interface FileDownloadSessionResponse {
  downloadUrl: string;
  contentType?: string;
  fileName?: string;
  size?: number;
  expiresInSeconds: number;
}

export const uploadFile = async (
  dockspaceId: string,
  fullPath: string,
  file: File
): Promise<void> => {
  const session = await apiRequest<UploadSessionResponse>(
    `/dockspaces/${dockspaceId}/files/upload-session`,
    {
      method: 'POST',
      body: JSON.stringify({
        fullPath,
        contentType: file.type || 'application/octet-stream'
      })
    }
  );

  const uploadResponse = await fetch(session.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'content-type': file.type || 'application/octet-stream'
    }
  });

  if (!uploadResponse.ok) {
    throw new Error('Upload to object storage failed');
  }

  const etag = uploadResponse.headers.get('etag') ?? '';

  await apiRequest(`/dockspaces/${dockspaceId}/files/confirm-upload`, {
    method: 'POST',
    body: JSON.stringify({
      fullPath,
      objectKey: session.objectKey,
      size: file.size,
      contentType: file.type || 'application/octet-stream',
      etag
    })
  });
};

export const moveToTrash = async (dockspaceId: string, fullPath: string): Promise<void> => {
  await apiRequest(`/dockspaces/${dockspaceId}/files/trash`, {
    method: 'POST',
    body: JSON.stringify({ fullPath })
  });
};

export const createFileDownloadSession = async (
  dockspaceId: string,
  fileNodeId: string,
  options?: { disposition?: 'inline' | 'attachment' }
): Promise<FileDownloadSessionResponse> => {
  const query = options?.disposition ? `?disposition=${options.disposition}` : '';
  return apiRequest(`/dockspaces/${dockspaceId}/files/${encodeURIComponent(fileNodeId)}/download-session${query}`);
};

export const renameFile = async (
  dockspaceId: string,
  fullPath: string,
  newName: string
): Promise<void> => {
  await apiRequest(`/dockspaces/${dockspaceId}/files/rename`, {
    method: 'PATCH',
    body: JSON.stringify({ fullPath, newName })
  });
};

export const restoreFile = async (dockspaceId: string, fullPath: string): Promise<void> => {
  await apiRequest(`/dockspaces/${dockspaceId}/files/restore`, {
    method: 'POST',
    body: JSON.stringify({ fullPath })
  });
};
