import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { authStore } from '@/lib/authStore';
import {
  listFiles,
  listPurged,
  listTrash,
  moveToTrash,
  restoreFile,
  uploadFile
} from '@/lib/vaultApi';

export const filesQueryKey = (userId: string, vaultId: string, folder: string) =>
  ['files', userId, vaultId, folder] as const;

export const trashQueryKey = (userId: string, vaultId: string) =>
  ['trash', userId, vaultId] as const;

export const purgedQueryKey = (userId: string, vaultId: string) =>
  ['purged', userId, vaultId] as const;

export const useFiles = (vaultId: string, folder: string) => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useQuery({
    queryKey: filesQueryKey(userId, vaultId, folder),
    queryFn: () => listFiles(vaultId, folder),
    enabled: Boolean(userId)
  });
};

export const useTrash = (vaultId: string) => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useQuery({
    queryKey: trashQueryKey(userId, vaultId),
    queryFn: () => listTrash(vaultId),
    enabled: Boolean(userId)
  });
};

export const usePurged = (vaultId: string) => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useQuery({
    queryKey: purgedQueryKey(userId, vaultId),
    queryFn: () => listPurged(vaultId),
    enabled: Boolean(userId)
  });
};

export const useUploadFile = (vaultId: string, folder: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: ({ fullPath, file }: { fullPath: string; file: File }) =>
      uploadFile(vaultId, fullPath, file),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: filesQueryKey(userId, vaultId, folder)
      });
    }
  });
};

export const useMoveToTrash = (vaultId: string, folder: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: (fullPath: string) => moveToTrash(vaultId, fullPath),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: filesQueryKey(userId, vaultId, folder)
        }),
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
          queryKey: filesQueryKey(userId, vaultId, '/')
        })
      ]);
    }
  });
};
