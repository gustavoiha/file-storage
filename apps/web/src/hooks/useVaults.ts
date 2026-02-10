import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { authStore } from '@/lib/authStore';
import { createVault, listVaults } from '@/lib/vaultApi';

export const vaultQueryKey = (userId: string) => ['vaults', userId] as const;

export const useVaults = () => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useQuery({
    queryKey: vaultQueryKey(userId),
    queryFn: listVaults,
    enabled: Boolean(userId)
  });
};

export const useCreateVault = () => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: createVault,
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await queryClient.invalidateQueries({ queryKey: vaultQueryKey(userId) });
    }
  });
};
