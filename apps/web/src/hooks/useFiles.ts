import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { authStore } from '@/lib/authStore';
import type { DirectoryChildrenRecord } from '@/lib/apiTypes';
import {
  createFolder,
  listFolderChildren,
  listPurged,
  listTrash,
  moveFiles,
  moveToTrash,
  purgeFileNow,
  renameFile,
  renameFolder,
  restoreFile,
  uploadFile
} from '@/lib/dockspaceApi';

const ROOT_FOLDER_NODE_ID = 'root';

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

      await queryClient.invalidateQueries({ queryKey: ['files', userId, dockspaceId] });
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

export const useMoveToTrash = (dockspaceId: string, folder: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';
  void folder;

  return useMutation({
    mutationFn: (params: { fullPath: string; targetType?: 'file' | 'folder' }) =>
      moveToTrash(dockspaceId, params),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['files', userId, dockspaceId] }),
        queryClient.invalidateQueries({ queryKey: trashQueryKey(userId, dockspaceId) })
      ]);
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
    mutationFn: (fullPath: string) => restoreFile(dockspaceId, fullPath),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trashQueryKey(userId, dockspaceId) }),
        queryClient.invalidateQueries({
          queryKey: filesQueryKey(userId, dockspaceId, ROOT_FOLDER_NODE_ID)
        })
      ]);
    }
  });
};

export const usePurgeFileNow = (dockspaceId: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: (fullPath: string) => purgeFileNow(dockspaceId, fullPath),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trashQueryKey(userId, dockspaceId) }),
        queryClient.invalidateQueries({ queryKey: purgedQueryKey(userId, dockspaceId) })
      ]);
    }
  });
};
