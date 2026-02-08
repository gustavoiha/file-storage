import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createVault, listVaults } from '@/lib/vaultApi';

export const vaultQueryKey = ['vaults'] as const;

export const useVaults = () =>
  useQuery({
    queryKey: vaultQueryKey,
    queryFn: listVaults
  });

export const useCreateVault = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createVault,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: vaultQueryKey });
    }
  });
};
