import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { authStore } from '@/lib/authStore';
import type { DirectoryChildrenRecord } from '@/lib/apiTypes';
import {
  createFolder,
  listFolderChildren,
  listPurged,
  listTrash,
  moveToTrash,
  restoreFile,
  uploadFile
} from '@/lib/vaultApi';

const ROOT_FOLDER_NODE_ID = 'root';

export const filesQueryKey = (userId: string, vaultId: string, parentFolderNodeId: string) =>
  ['files', userId, vaultId, parentFolderNodeId] as const;

export const trashQueryKey = (userId: string, vaultId: string) =>
  ['trash', userId, vaultId] as const;

export const purgedQueryKey = (userId: string, vaultId: string) =>
  ['purged', userId, vaultId] as const;

export const useFiles = (vaultId: string, parentFolderNodeId: string) => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useQuery<DirectoryChildrenRecord>({
    queryKey: filesQueryKey(userId, vaultId, parentFolderNodeId),
    queryFn: () => listFolderChildren(vaultId, parentFolderNodeId),
    enabled: Boolean(userId)
  });
};

export const useTrash = (vaultId: string) => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useQuery({
    queryKey: trashQueryKey(userId, vaultId),
    queryFn: () => listTrash(vaultId),
    enabled: Boolean(userId && vaultId)
  });
};

export const usePurged = (vaultId: string) => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useQuery({
    queryKey: purgedQueryKey(userId, vaultId),
    queryFn: () => listPurged(vaultId),
    enabled: Boolean(userId && vaultId)
  });
};

export const useUploadFile = (vaultId: string, folder: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';
  void folder;

  return useMutation({
    mutationFn: ({ fullPath, file }: { fullPath: string; file: File }) =>
      uploadFile(vaultId, fullPath, file),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['files', userId, vaultId] });
    }
  });
};

export const useCreateFolder = (vaultId: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: (folderPath: string) => createFolder(vaultId, folderPath),
    onSuccess: async (_response, folderPath) => {
      if (!userId) {
        return;
      }

      void folderPath;
      await queryClient.invalidateQueries({ queryKey: ['files', userId, vaultId] });
    }
  });
};

export const useMoveToTrash = (vaultId: string, folder: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';
  void folder;

  return useMutation({
    mutationFn: (fullPath: string) => moveToTrash(vaultId, fullPath),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['files', userId, vaultId] }),
        queryClient.invalidateQueries({ queryKey: trashQueryKey(userId, vaultId) })
      ]);
    }
  });
};

export const useRestoreFile = (vaultId: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: (fullPath: string) => restoreFile(vaultId, fullPath),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trashQueryKey(userId, vaultId) }),
        queryClient.invalidateQueries({
          queryKey: filesQueryKey(userId, vaultId, ROOT_FOLDER_NODE_ID)
        })
      ]);
    }
  });
};
