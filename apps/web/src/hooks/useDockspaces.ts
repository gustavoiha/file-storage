import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { authStore } from '@/lib/authStore';
import { createDockspace, listDockspaces } from '@/lib/dockspaceApi';
import type { DockspaceType } from '@/lib/apiTypes';

export const dockspaceQueryKey = (userId: string) => ['dockspaces', userId] as const;

export const useDockspaces = () => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useQuery({
    queryKey: dockspaceQueryKey(userId),
    queryFn: listDockspaces,
    enabled: Boolean(userId)
  });
};

export const useCreateDockspace = () => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: (params: { name: string; dockspaceType: DockspaceType }) =>
      createDockspace(params),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await queryClient.invalidateQueries({ queryKey: dockspaceQueryKey(userId) });
    }
  });
};
