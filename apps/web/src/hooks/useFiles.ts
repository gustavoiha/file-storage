import {
  type InfiniteData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { authStore } from '@/lib/authStore';
import { ApiError } from '@/lib/apiClient';
import type {
  DirectoryChildrenRecord,
  MediaDuplicateGroupRecord,
  MediaDuplicatesResponse,
  MediaFileRecord,
  MediaListResponse
} from '@/lib/apiTypes';
import {
  createFolder,
  listFolderChildren,
  listPurged,
  listTrash,
  moveFolder,
  moveFiles,
  moveToTrash,
  purgeFileNow,
  renameFile,
  renameFolder,
  restoreFile,
  uploadFile,
  type TrashedFileTarget
} from '@/lib/dockspaceApi';

const ROOT_FOLDER_NODE_ID = 'root';
const BATCH_TRASH_CONCURRENCY = 3;

export const filesQueryKey = (userId: string, dockspaceId: string, parentFolderNodeId: string) =>
  ['files', userId, dockspaceId, parentFolderNodeId] as const;

export const trashQueryKey = (userId: string, dockspaceId: string) =>
  ['trash', userId, dockspaceId] as const;

export const purgedQueryKey = (userId: string, dockspaceId: string) =>
  ['purged', userId, dockspaceId] as const;

export const useFiles = (dockspaceId: string, parentFolderNodeId: string) => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useQuery<DirectoryChildrenRecord>({
    queryKey: filesQueryKey(userId, dockspaceId, parentFolderNodeId),
    queryFn: () => listFolderChildren(dockspaceId, parentFolderNodeId),
    enabled: Boolean(userId)
  });
};

export const useDiscoverFolder = (dockspaceId: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: async (parentFolderNodeId: string) => {
      if (!userId) {
        return {
          parentFolderNodeId,
          items: []
        } as DirectoryChildrenRecord;
      }

      return queryClient.fetchQuery({
        queryKey: filesQueryKey(userId, dockspaceId, parentFolderNodeId),
        queryFn: () => listFolderChildren(dockspaceId, parentFolderNodeId)
      });
    }
  });
};

export const useTrash = (dockspaceId: string) => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useQuery({
    queryKey: trashQueryKey(userId, dockspaceId),
    queryFn: () => listTrash(dockspaceId),
    enabled: Boolean(userId && dockspaceId)
  });
};

export const usePurged = (dockspaceId: string) => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useQuery({
    queryKey: purgedQueryKey(userId, dockspaceId),
    queryFn: () => listPurged(dockspaceId),
    enabled: Boolean(userId && dockspaceId)
  });
};

export const useUploadFile = (dockspaceId: string, folder: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';
  void folder;

  return useMutation({
    mutationFn: ({
      fullPath,
      file,
      onProgress
    }: {
      fullPath: string;
      file: File;
      onProgress?: (progress: number) => void;
    }) =>
      onProgress
        ? uploadFile(dockspaceId, fullPath, file, { onProgress })
        : uploadFile(dockspaceId, fullPath, file),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['files', userId, dockspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['media-duplicates', userId, dockspaceId] })
      ]);
    }
  });
};

export const useCreateFolder = (dockspaceId: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: (folderPath: string) => createFolder(dockspaceId, folderPath),
    onSuccess: async (_response, folderPath) => {
      if (!userId) {
        return;
      }

      void folderPath;
      await queryClient.invalidateQueries({ queryKey: ['files', userId, dockspaceId] });
    }
  });
};

export const useRenameFolder = (dockspaceId: string, folder: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';
  void folder;

  return useMutation({
    mutationFn: ({ folderPath, newName }: { folderPath: string; newName: string }) =>
      renameFolder(dockspaceId, folderPath, newName),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['files', userId, dockspaceId] });
    }
  });
};

/**
 * A duplicate group without the given files, recomputed the way the server builds it (items stay in its order, the
 * first one is the default keeper), or null when fewer than two files are left and it is no longer a duplicate group.
 */
const withoutTrashedDuplicates = (
  group: MediaDuplicateGroupRecord,
  keep: (item: MediaFileRecord) => boolean
): MediaDuplicateGroupRecord | null => {
  const items = group.items.filter(keep);
  if (items.length < 2) {
    return null;
  }

  const totalGroupSizeBytes = items.reduce((sum, item) => sum + item.size, 0);
  return {
    ...group,
    items,
    duplicateCount: items.length - 1,
    totalGroupSizeBytes,
    reclaimableBytes: totalGroupSizeBytes - (items[0]?.size ?? 0),
    defaultKeeperFileNodeId: items[0]?.fileNodeId ?? group.defaultKeeperFileNodeId
  };
};

/** Takes trashed files out of every loaded page of the cached duplicate groups, and their totals out of the summary. */
const removeTrashedDuplicates = (
  data: InfiniteData<MediaDuplicatesResponse> | undefined,
  keep: (item: MediaFileRecord) => boolean
) => {
  if (!data?.pages || data.pages.every((page) => page.items.every((group) => group.items.every(keep)))) {
    return data;
  }

  let removedGroups = 0;
  let removedDuplicateItems = 0;
  let removedReclaimableBytes = 0;
  const pages = data.pages.map((page) => {
    if (page.items.every((group) => group.items.every(keep))) {
      return page;
    }

    const groups: MediaDuplicateGroupRecord[] = [];
    for (const group of page.items) {
      if (group.items.every(keep)) {
        groups.push(group);
        continue;
      }

      const next = withoutTrashedDuplicates(group, keep);
      removedDuplicateItems += group.duplicateCount - (next?.duplicateCount ?? 0);
      removedReclaimableBytes += group.reclaimableBytes - (next?.reclaimableBytes ?? 0);
      if (next) {
        groups.push(next);
      } else {
        removedGroups += 1;
      }
    }

    return { ...page, items: groups };
  });

  // The summary covers every group, loaded or not; it is read from the first page.
  const [firstPage, ...otherPages] = pages;
  if (!firstPage) {
    return { ...data, pages };
  }

  return {
    ...data,
    pages: [
      {
        ...firstPage,
        summary: {
          groupCount: Math.max(0, firstPage.summary.groupCount - removedGroups),
          duplicateItemCount: Math.max(0, firstPage.summary.duplicateItemCount - removedDuplicateItems),
          reclaimableBytes: Math.max(0, firstPage.summary.reclaimableBytes - removedReclaimableBytes)
        }
      },
      ...otherPages
    ]
  };
};

/**
 * Takes trashed files out of the cached gallery (every loaded page), the duplicate groups and album lists at once, so
 * they leave without waiting for a refetch. The refetch that follows cannot bring them back: the server has already
 * trashed them, and invalidating cancels any request that was in flight when the trash succeeded.
 */
const removeTrashedMedia = (
  queryClient: QueryClient,
  userId: string,
  dockspaceId: string,
  isTrashed: (fullPath: string) => boolean
) => {
  const keep = (item: MediaFileRecord) => !isTrashed(item.fullPath);

  queryClient.setQueriesData<InfiniteData<MediaListResponse>>(
    { queryKey: ['media', userId, dockspaceId] },
    (data) => {
      if (!data?.pages || data.pages.every((page) => page.items.every(keep))) {
        return data;
      }

      return {
        ...data,
        pages: data.pages.map((page) =>
          page.items.every(keep) ? page : { ...page, items: page.items.filter(keep) }
        )
      };
    }
  );

  queryClient.setQueriesData<InfiniteData<MediaDuplicatesResponse>>(
    { queryKey: ['media-duplicates', userId, dockspaceId] },
    (data) => removeTrashedDuplicates(data, keep)
  );

  queryClient.setQueriesData<MediaFileRecord[]>(
    { queryKey: ['album-media', userId, dockspaceId] },
    (data) => (Array.isArray(data) && !data.every(keep) ? data.filter(keep) : data)
  );
};

/**
 * Refreshes everything a trash changes except folder listings. Not awaited: the gallery query is paged, and its
 * refetch requests every loaded page again, one after another, which can take seconds.
 */
const refetchAfterTrashInBackground = (queryClient: QueryClient, userId: string, dockspaceId: string) => {
  for (const queryKey of [
    trashQueryKey(userId, dockspaceId),
    ['media', userId, dockspaceId],
    ['media-duplicates', userId, dockspaceId],
    ['albums', userId, dockspaceId],
    ['album-media', userId, dockspaceId],
    ['media-albums', userId, dockspaceId]
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
};

export const useMoveToTrash = (dockspaceId: string, folder: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';
  void folder;

  return useMutation({
    mutationFn: (params: { fullPath: string; targetType?: 'file' | 'folder' }) =>
      moveToTrash(dockspaceId, params),
    onSuccess: async (_response, { fullPath, targetType }) => {
      if (!userId) {
        return;
      }

      const folderPrefix = `${fullPath.replace(/\/+$/, '')}/`;
      removeTrashedMedia(
        queryClient,
        userId,
        dockspaceId,
        targetType === 'folder'
          ? (itemPath) => itemPath.startsWith(folderPrefix)
          : (itemPath) => itemPath === fullPath
      );
      refetchAfterTrashInBackground(queryClient, userId, dockspaceId);
      // The files page moves focus off the trashed row once its listing no longer has it, so this one is awaited.
      // It is only refetched where a folder listing is on screen; in the gallery it resolves at once.
      await queryClient.invalidateQueries({ queryKey: ['files', userId, dockspaceId] });
    }
  });
};

export interface BatchTrashResult {
  movedPaths: string[];
  failed: Array<{ fullPath: string; error: string; statusCode?: number }>;
}

export const useTrashFilesBatch = (dockspaceId: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: async (fullPaths: string[]): Promise<BatchTrashResult> => {
      const dedupedFullPaths = Array.from(new Set(fullPaths));
      const movedPaths: string[] = [];
      const failed: Array<{ fullPath: string; error: string; statusCode?: number }> = [];
      let cursor = 0;

      const runWorker = async () => {
        while (cursor < dedupedFullPaths.length) {
          const nextIndex = cursor;
          cursor += 1;
          const fullPath = dedupedFullPaths[nextIndex];
          if (!fullPath) {
            continue;
          }

          try {
            await moveToTrash(dockspaceId, { fullPath, targetType: 'file' });
            movedPaths.push(fullPath);
          } catch (error) {
            if (error instanceof ApiError && error.statusCode === 404) {
              continue;
            }

            failed.push({
              fullPath,
              error: error instanceof Error ? error.message : 'Failed to move file to trash.',
              ...(error instanceof ApiError ? { statusCode: error.statusCode } : {})
            });
          }
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(BATCH_TRASH_CONCURRENCY, dedupedFullPaths.length) },
          async () => await runWorker()
        )
      );

      return {
        movedPaths,
        failed
      };
    },
    onSuccess: ({ movedPaths }) => {
      if (!userId) {
        return;
      }

      // Nothing here is awaited: the caller closes its dialog and clears the selection as soon as the trash requests
      // succeed. The trashed tiles leave the cached gallery now, and the refetches run in the background.
      const moved = new Set(movedPaths);
      removeTrashedMedia(queryClient, userId, dockspaceId, (itemPath) => moved.has(itemPath));
      refetchAfterTrashInBackground(queryClient, userId, dockspaceId);
      void queryClient.invalidateQueries({ queryKey: ['files', userId, dockspaceId] });
    }
  });
};

export const useMoveFiles = (dockspaceId: string, folder: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';
  void folder;

  return useMutation({
    mutationFn: (params: { sourcePaths: string[]; targetFolderPath: string }) =>
      moveFiles(dockspaceId, params),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['files', userId, dockspaceId] });
    }
  });
};

export const useMoveFolder = (dockspaceId: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: (params: { sourceFolderPath: string; targetFolderPath: string }) =>
      moveFolder(dockspaceId, params),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['files', userId, dockspaceId] });
    }
  });
};

export const useRenameFile = (dockspaceId: string, folder: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';
  void folder;

  return useMutation({
    mutationFn: ({ fullPath, newName }: { fullPath: string; newName: string }) =>
      renameFile(dockspaceId, fullPath, newName),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['files', userId, dockspaceId] });
    }
  });
};

export const useRestoreFile = (dockspaceId: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: (target: TrashedFileTarget) => restoreFile(dockspaceId, target),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trashQueryKey(userId, dockspaceId) }),
        queryClient.invalidateQueries({
          queryKey: filesQueryKey(userId, dockspaceId, ROOT_FOLDER_NODE_ID)
        }),
        queryClient.invalidateQueries({ queryKey: ['media', userId, dockspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['media-duplicates', userId, dockspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['albums', userId, dockspaceId] })
      ]);
    }
  });
};

export const usePurgeFileNow = (dockspaceId: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: (target: TrashedFileTarget) => purgeFileNow(dockspaceId, target),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trashQueryKey(userId, dockspaceId) }),
        queryClient.invalidateQueries({ queryKey: purgedQueryKey(userId, dockspaceId) }),
        queryClient.invalidateQueries({ queryKey: ['media', userId, dockspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['media-duplicates', userId, dockspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['albums', userId, dockspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['album-media', userId, dockspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['media-albums', userId, dockspaceId] })
      ]);
    }
  });
};
