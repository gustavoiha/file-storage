import { apiRequest } from './apiClient';
import type {
  AlbumRecord,
  DirectoryChildrenRecord,
  Dockspace,
  DockspaceType,
  FileRecord,
  MediaDuplicatesResponse,
  MediaFileRecord,
  MediaListResponse
} from './apiTypes';
import { inferUploadContentType } from './fileContentType';

export const listDockspaces = async (): Promise<Dockspace[]> => {
  const response = await apiRequest<{ items: Dockspace[] }>('/dockspaces');
  return response.items;
};

export const createDockspace = async (params: {
  name: string;
  dockspaceType: DockspaceType;
}): Promise<Dockspace> =>
  apiRequest<Dockspace>('/dockspaces', {
    method: 'POST',
    body: JSON.stringify(params)
  });

export const listMedia = async (
  dockspaceId: string,
  options?: { cursor?: string; limit?: number }
): Promise<MediaListResponse> => {
  const search = new URLSearchParams();
  if (options?.cursor) {
    search.set('cursor', options.cursor);
  }

  if (options?.limit) {
    search.set('limit', String(options.limit));
  }

  const query = search.toString();
  return apiRequest<MediaListResponse>(`/dockspaces/${dockspaceId}/media${query ? `?${query}` : ''}`);
};

export const listMediaDuplicates = async (
  dockspaceId: string,
  options?: { cursor?: string; limit?: number }
): Promise<MediaDuplicatesResponse> => {
  const search = new URLSearchParams();
  if (options?.cursor) {
    search.set('cursor', options.cursor);
  }

  if (options?.limit) {
    search.set('limit', String(options.limit));
  }

  const query = search.toString();
  return apiRequest<MediaDuplicatesResponse>(
    `/dockspaces/${dockspaceId}/media/duplicates${query ? `?${query}` : ''}`
  );
};

export const listAlbums = async (dockspaceId: string): Promise<AlbumRecord[]> => {
  const response = await apiRequest<{ items: AlbumRecord[] }>(`/dockspaces/${dockspaceId}/albums`);
  return response.items;
};

export const createAlbum = async (
  dockspaceId: string,
  name: string
): Promise<AlbumRecord> =>
  apiRequest<AlbumRecord>(`/dockspaces/${dockspaceId}/albums`, {
    method: 'POST',
    body: JSON.stringify({ name })
  });

export const renameAlbum = async (
  dockspaceId: string,
  albumId: string,
  name: string
): Promise<{ albumId: string; name: string; updatedAt: string }> =>
  apiRequest<{ albumId: string; name: string; updatedAt: string }>(
    `/dockspaces/${dockspaceId}/albums/${encodeURIComponent(albumId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ name })
    }
  );

export const deleteAlbum = async (
  dockspaceId: string,
  albumId: string
): Promise<{ albumId: string; deleted: boolean }> =>
  apiRequest<{ albumId: string; deleted: boolean }>(
    `/dockspaces/${dockspaceId}/albums/${encodeURIComponent(albumId)}`,
    {
      method: 'DELETE'
    }
  );

export const assignAlbumMedia = async (
  dockspaceId: string,
  albumId: string,
  fileNodeIds: string[]
): Promise<{ albumId: string; assignedFileNodeIds: string[] }> =>
  apiRequest<{ albumId: string; assignedFileNodeIds: string[] }>(
    `/dockspaces/${dockspaceId}/albums/${encodeURIComponent(albumId)}/media`,
    {
      method: 'POST',
      body: JSON.stringify({ fileNodeIds })
    }
  );

export const removeAlbumMedia = async (
  dockspaceId: string,
  albumId: string,
  fileNodeId: string
): Promise<{ albumId: string; fileNodeId: string; removed: boolean }> =>
  apiRequest<{ albumId: string; fileNodeId: string; removed: boolean }>(
    `/dockspaces/${dockspaceId}/albums/${encodeURIComponent(albumId)}/media/${encodeURIComponent(fileNodeId)}`,
    {
      method: 'DELETE'
    }
  );

export const listAlbumMedia = async (
  dockspaceId: string,
  albumId: string
): Promise<MediaFileRecord[]> => {
  const response = await apiRequest<{ items: MediaFileRecord[] }>(
    `/dockspaces/${dockspaceId}/albums/${encodeURIComponent(albumId)}/media`
  );
  return response.items;
};

export const listMediaAlbums = async (
  dockspaceId: string,
  fileNodeId: string
): Promise<AlbumRecord[]> => {
  const response = await apiRequest<{ items: AlbumRecord[] }>(
    `/dockspaces/${dockspaceId}/media/${encodeURIComponent(fileNodeId)}/albums`
  );
  return response.items;
};

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

interface MultipartUploadStartResponse {
  uploadId: string;
  objectKey: string;
  fileNodeId: string;
  partSize: number;
  partCount: number;
  expiresInSeconds: number;
}

interface MultipartPartUrlsResponse {
  urls: Array<{
    partNumber: number;
    uploadUrl: string;
    expiresInSeconds: number;
  }>;
}

interface UploadFileOptions {
  onProgress?: (progress: number) => void;
}

const MULTIPART_THRESHOLD_BYTES = 100 * 1024 * 1024;
const MULTIPART_PART_CONCURRENCY = 4;
const MULTIPART_MAX_PART_RETRIES = 3;
const MULTIPART_PART_URL_BATCH_SIZE = 100;

const sleep = async (durationMs: number): Promise<void> =>
  await new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });

const chunksOf = <T>(values: T[], chunkSize: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
};

const computeFileSha256Hex = async (file: File): Promise<string> => {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Browser does not support file hashing required for media duplicate checks.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
};

const startMultipartUpload = async (
  dockspaceId: string,
  params: { fullPath: string; contentType: string; size: number; contentHash?: string }
): Promise<MultipartUploadStartResponse> =>
  apiRequest<MultipartUploadStartResponse>(`/dockspaces/${dockspaceId}/files/multipart/start`, {
    method: 'POST',
    body: JSON.stringify(params)
  });

const getMultipartPartUrls = async (
  dockspaceId: string,
  params: { objectKey: string; uploadId: string; partNumbers: number[] }
): Promise<MultipartPartUrlsResponse> =>
  apiRequest<MultipartPartUrlsResponse>(`/dockspaces/${dockspaceId}/files/multipart/part-urls`, {
    method: 'POST',
    body: JSON.stringify(params)
  });

const completeMultipartUpload = async (
  dockspaceId: string,
  params: {
    fullPath: string;
    objectKey: string;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
    size: number;
    contentType: string;
  }
): Promise<void> => {
  await apiRequest(`/dockspaces/${dockspaceId}/files/multipart/complete`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
};

const abortMultipartUpload = async (
  dockspaceId: string,
  params: { objectKey: string; uploadId: string }
): Promise<void> => {
  await apiRequest(`/dockspaces/${dockspaceId}/files/multipart/abort`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
};

const uploadSinglePutFile = async (
  dockspaceId: string,
  fullPath: string,
  file: File,
  options?: UploadFileOptions
): Promise<void> => {
  const contentType = inferUploadContentType(file);
  const contentHash = await computeFileSha256Hex(file);
  const session = await apiRequest<UploadSessionResponse>(
    `/dockspaces/${dockspaceId}/files/upload-session`,
    {
      method: 'POST',
      body: JSON.stringify({
        fullPath,
        contentType,
        contentHash
      })
    }
  );

  const etag = await new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', session.uploadUrl);
    request.setRequestHeader('content-type', contentType);

    request.upload.onprogress = (event) => {
      if (!options?.onProgress || !event.lengthComputable) {
        return;
      }

      const nextProgress = Math.min(100, Math.round((event.loaded / event.total) * 100));
      options.onProgress(nextProgress);
    };

    request.onerror = () => {
      reject(new Error('Upload to object storage failed'));
    };

    request.onabort = () => {
      reject(new Error('Upload to object storage was cancelled'));
    };

    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error('Upload to object storage failed'));
        return;
      }

      options?.onProgress?.(100);
      resolve(request.getResponseHeader('etag') ?? '');
    };

    request.send(file);
  });

  await apiRequest(`/dockspaces/${dockspaceId}/files/confirm-upload`, {
    method: 'POST',
    body: JSON.stringify({
      fullPath,
      objectKey: session.objectKey,
      size: file.size,
      contentType,
      etag
    })
  });
};

const uploadFileMultipart = async (
  dockspaceId: string,
  fullPath: string,
  file: File,
  options?: UploadFileOptions
): Promise<void> => {
  const contentType = inferUploadContentType(file);
  const contentHash = await computeFileSha256Hex(file);
  const session = await startMultipartUpload(dockspaceId, {
    fullPath,
    contentType,
    size: file.size,
    contentHash
  });
  const partNumbers = Array.from({ length: session.partCount }, (_, index) => index + 1);
  const partUrlByNumber = new Map<number, string>();
  const partUploadedBytes = new Map<number, number>();
  const etagByPartNumber = new Map<number, string>();
  const activeRequests = new Set<XMLHttpRequest>();

  const emitProgress = () => {
    if (!options?.onProgress || file.size <= 0) {
      return;
    }

    let loadedBytes = 0;
    for (const uploadedBytes of partUploadedBytes.values()) {
      loadedBytes += uploadedBytes;
    }

    const nextProgress = Math.min(99, Math.round((loadedBytes / file.size) * 100));
    options.onProgress(nextProgress);
  };

  const uploadPart = async (partNumber: number, uploadUrl: string): Promise<string> =>
    await new Promise<string>((resolve, reject) => {
      const partStartByte = (partNumber - 1) * session.partSize;
      const partEndByte = Math.min(partStartByte + session.partSize, file.size);
      const partBlob = file.slice(partStartByte, partEndByte);
      const request = new XMLHttpRequest();

      activeRequests.add(request);
      request.open('PUT', uploadUrl);

      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          partUploadedBytes.set(partNumber, event.loaded);
          emitProgress();
        }
      };

      request.onerror = () => {
        activeRequests.delete(request);
        reject(new Error('Upload part request failed'));
      };

      request.onabort = () => {
        activeRequests.delete(request);
        reject(new Error('Upload part request was aborted'));
      };

      request.onload = () => {
        activeRequests.delete(request);
        if (request.status < 200 || request.status >= 300) {
          reject(new Error(`Upload part request failed with status ${request.status}`));
          return;
        }

        const etag = request.getResponseHeader('etag');
        if (!etag) {
          reject(new Error('Missing ETag for uploaded part'));
          return;
        }

        partUploadedBytes.set(partNumber, partBlob.size);
        emitProgress();
        resolve(etag);
      };

      request.send(partBlob);
    });

  const refreshPartUrls = async (numbers: number[]) => {
    for (const partNumberChunk of chunksOf(numbers, MULTIPART_PART_URL_BATCH_SIZE)) {
      const response = await getMultipartPartUrls(dockspaceId, {
        objectKey: session.objectKey,
        uploadId: session.uploadId,
        partNumbers: partNumberChunk
      });

      for (const urlEntry of response.urls) {
        partUrlByNumber.set(urlEntry.partNumber, urlEntry.uploadUrl);
      }
    }
  };

  try {
    await refreshPartUrls(partNumbers);

    let nextPartIndex = 0;
    const workers = Array.from(
      { length: Math.min(MULTIPART_PART_CONCURRENCY, partNumbers.length) },
      async () => {
        while (nextPartIndex < partNumbers.length) {
          const currentIndex = nextPartIndex;
          nextPartIndex += 1;
          const partNumber = partNumbers[currentIndex];
          if (!partNumber) {
            return;
          }

          let attempt = 0;
          while (attempt < MULTIPART_MAX_PART_RETRIES) {
            attempt += 1;
            try {
              if (!partUrlByNumber.has(partNumber)) {
                await refreshPartUrls([partNumber]);
              }

              const uploadUrl = partUrlByNumber.get(partNumber);
              if (!uploadUrl) {
                throw new Error('Missing upload URL for part');
              }

              const etag = await uploadPart(partNumber, uploadUrl);
              etagByPartNumber.set(partNumber, etag);
              break;
            } catch (error) {
              if (attempt >= MULTIPART_MAX_PART_RETRIES) {
                throw error;
              }

              partUploadedBytes.set(partNumber, 0);
              emitProgress();
              await sleep(250 * 2 ** (attempt - 1));
              await refreshPartUrls([partNumber]);
            }
          }
        }
      }
    );

    await Promise.all(workers);

    const completedParts = partNumbers.map((partNumber) => {
      const etag = etagByPartNumber.get(partNumber);
      if (!etag) {
        throw new Error('Multipart upload did not complete all parts');
      }

      return {
        partNumber,
        etag
      };
    });

    await completeMultipartUpload(dockspaceId, {
      fullPath,
      objectKey: session.objectKey,
      uploadId: session.uploadId,
      parts: completedParts,
      size: file.size,
      contentType
    });
    options?.onProgress?.(100);
  } catch (error) {
    for (const request of activeRequests) {
      request.abort();
    }

    try {
      await abortMultipartUpload(dockspaceId, {
        objectKey: session.objectKey,
        uploadId: session.uploadId
      });
    } catch {
      // Abort failure should not mask the upload failure.
    }

    throw (error instanceof Error ? error : new Error('Multipart upload failed'));
  }
};

export interface FileDownloadSessionResponse {
  downloadUrl: string;
  contentType?: string;
  fileName?: string;
  size?: number;
  expiresInSeconds: number;
}

export interface MoveFilesResponse {
  targetFolderPath: string;
  moved: Array<{ from: string; to: string }>;
  failed: Array<{
    from: string;
    code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID';
    error: string;
  }>;
}

export interface MoveFolderResponse {
  status: 'MOVED' | 'UNCHANGED';
  from: string;
  to: string;
  moved: boolean;
  updatedAt: string;
}

export const uploadFile = async (
  dockspaceId: string,
  fullPath: string,
  file: File,
  options?: UploadFileOptions
): Promise<void> => {
  if (file.size >= MULTIPART_THRESHOLD_BYTES) {
    await uploadFileMultipart(dockspaceId, fullPath, file, options);
    return;
  }

  await uploadSinglePutFile(dockspaceId, fullPath, file, options);
};

export const moveToTrash = async (
  dockspaceId: string,
  params: { fullPath: string; targetType?: 'file' | 'folder' }
): Promise<void> => {
  await apiRequest(`/dockspaces/${dockspaceId}/files/trash`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
};

export const moveFiles = async (
  dockspaceId: string,
  params: { sourcePaths: string[]; targetFolderPath: string }
): Promise<MoveFilesResponse> =>
  apiRequest<MoveFilesResponse>(`/dockspaces/${dockspaceId}/files/move`, {
    method: 'POST',
    body: JSON.stringify(params)
  });

export const moveFolder = async (
  dockspaceId: string,
  params: { sourceFolderPath: string; targetFolderPath: string }
): Promise<MoveFolderResponse> =>
  apiRequest<MoveFolderResponse>(`/dockspaces/${dockspaceId}/folders/move`, {
    method: 'POST',
    body: JSON.stringify(params)
  });

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

export interface PurgeFileNowResponse {
  fullPath: string;
  state: 'PURGED';
  purgedAt: string;
}

export const purgeFileNow = async (
  dockspaceId: string,
  fullPath: string
): Promise<PurgeFileNowResponse> =>
  apiRequest<PurgeFileNowResponse>(`/dockspaces/${dockspaceId}/files/purge`, {
    method: 'POST',
    body: JSON.stringify({ fullPath })
  });
