import { apiRequest } from './apiClient';
import type { DirectoryChildrenRecord, FileRecord, Vault } from './apiTypes';

export const listVaults = async (): Promise<Vault[]> => {
  const response = await apiRequest<{ items: Vault[] }>('/vaults');
  return response.items;
};

export const createVault = async (name: string): Promise<Vault> =>
  apiRequest<Vault>('/vaults', {
    method: 'POST',
    body: JSON.stringify({ name })
  });

export const listFolderChildren = async (
  vaultId: string,
  parentFolderNodeId: string
): Promise<DirectoryChildrenRecord> => {
  const response = await apiRequest<DirectoryChildrenRecord>(
    `/vaults/${vaultId}/folders/${encodeURIComponent(parentFolderNodeId)}/children`
  );

  return response;
};

export const createFolder = async (
  vaultId: string,
  folderPath: string
): Promise<{ folderPath: string; folderNodeId: string; created: boolean }> =>
  apiRequest(`/vaults/${vaultId}/folders`, {
    method: 'POST',
    body: JSON.stringify({ folderPath })
  });

export const renameFolder = async (
  vaultId: string,
  folderPath: string,
  newName: string
): Promise<void> => {
  await apiRequest(`/vaults/${vaultId}/folders/rename`, {
    method: 'PATCH',
    body: JSON.stringify({ folderPath, newName })
  });
};

export const listTrash = async (vaultId: string): Promise<FileRecord[]> => {
  const response = await apiRequest<{ items: FileRecord[] }>(`/vaults/${vaultId}/trash`);
  return response.items;
};

export const listPurged = async (vaultId: string): Promise<FileRecord[]> => {
  const response = await apiRequest<{ items: FileRecord[] }>(`/vaults/${vaultId}/purged`);
  return response.items;
};

interface UploadSessionResponse {
  uploadUrl: string;
  objectKey: string;
  expiresInSeconds: number;
}

export const uploadFile = async (
  vaultId: string,
  fullPath: string,
  file: File
): Promise<void> => {
  const session = await apiRequest<UploadSessionResponse>(
    `/vaults/${vaultId}/files/upload-session`,
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

  await apiRequest(`/vaults/${vaultId}/files/confirm-upload`, {
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

export const moveToTrash = async (vaultId: string, fullPath: string): Promise<void> => {
  await apiRequest(`/vaults/${vaultId}/files/trash`, {
    method: 'POST',
    body: JSON.stringify({ fullPath })
  });
};

export const renameFile = async (
  vaultId: string,
  fullPath: string,
  newName: string
): Promise<void> => {
  await apiRequest(`/vaults/${vaultId}/files/rename`, {
    method: 'PATCH',
    body: JSON.stringify({ fullPath, newName })
  });
};

export const restoreFile = async (vaultId: string, fullPath: string): Promise<void> => {
  await apiRequest(`/vaults/${vaultId}/files/restore`, {
    method: 'POST',
    body: JSON.stringify({ fullPath })
  });
};
