import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listFiles,
  listPurged,
  listTrash,
  moveToTrash,
  restoreFile,
  uploadFile
} from '@/lib/vaultApi';

export const filesQueryKey = (vaultId: string, folder: string) =>
  ['files', vaultId, folder] as const;

export const trashQueryKey = (vaultId: string) => ['trash', vaultId] as const;

export const purgedQueryKey = (vaultId: string) => ['purged', vaultId] as const;

export const useFiles = (vaultId: string, folder: string) =>
  useQuery({
    queryKey: filesQueryKey(vaultId, folder),
    queryFn: () => listFiles(vaultId, folder)
  });

export const useTrash = (vaultId: string) =>
  useQuery({
    queryKey: trashQueryKey(vaultId),
    queryFn: () => listTrash(vaultId)
  });

export const usePurged = (vaultId: string) =>
  useQuery({
    queryKey: purgedQueryKey(vaultId),
    queryFn: () => listPurged(vaultId)
  });

export const useUploadFile = (vaultId: string, folder: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ fullPath, file }: { fullPath: string; file: File }) =>
      uploadFile(vaultId, fullPath, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: filesQueryKey(vaultId, folder) });
    }
  });
};

export const useMoveToTrash = (vaultId: string, folder: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fullPath: string) => moveToTrash(vaultId, fullPath),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: filesQueryKey(vaultId, folder) }),
        queryClient.invalidateQueries({ queryKey: trashQueryKey(vaultId) })
      ]);
    }
  });
};

export const useRestoreFile = (vaultId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fullPath: string) => restoreFile(vaultId, fullPath),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trashQueryKey(vaultId) }),
        queryClient.invalidateQueries({ queryKey: filesQueryKey(vaultId, '/') })
      ]);
    }
  });
};
