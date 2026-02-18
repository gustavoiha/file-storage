import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { authStore } from '@/lib/authStore';
import {
  assignAlbumMedia,
  createAlbum,
  deleteAlbum,
  listAlbumMedia,
  listAlbums,
  listMedia,
  listMediaDuplicates,
  listMediaAlbums,
  removeAlbumMedia,
  renameAlbum
} from '@/lib/dockspaceApi';

export const mediaQueryKey = (userId: string, dockspaceId: string) =>
  ['media', userId, dockspaceId] as const;

export const albumsQueryKey = (userId: string, dockspaceId: string) =>
  ['albums', userId, dockspaceId] as const;

export const albumMediaQueryKey = (userId: string, dockspaceId: string, albumId: string) =>
  ['album-media', userId, dockspaceId, albumId] as const;

export const mediaAlbumsQueryKey = (userId: string, dockspaceId: string, fileNodeId: string) =>
  ['media-albums', userId, dockspaceId, fileNodeId] as const;

export const mediaDuplicatesQueryKey = (userId: string, dockspaceId: string, pageSize: number) =>
  ['media-duplicates', userId, dockspaceId, pageSize] as const;

export const useMediaFiles = (dockspaceId: string) => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useQuery({
    queryKey: mediaQueryKey(userId, dockspaceId),
    queryFn: () => listMedia(dockspaceId),
    enabled: Boolean(userId && dockspaceId)
  });
};

export const useMediaDuplicates = (
  dockspaceId: string,
  pageSize = 20,
  enabled = true
) => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useInfiniteQuery({
    queryKey: mediaDuplicatesQueryKey(userId, dockspaceId, pageSize),
    queryFn: ({ pageParam }) =>
      listMediaDuplicates(dockspaceId, {
        ...(pageParam ? { cursor: String(pageParam) } : {}),
        limit: pageSize
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(userId && dockspaceId && enabled)
  });
};

export const useAlbums = (dockspaceId: string) => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useQuery({
    queryKey: albumsQueryKey(userId, dockspaceId),
    queryFn: () => listAlbums(dockspaceId),
    enabled: Boolean(userId && dockspaceId)
  });
};

export const useAlbumMedia = (dockspaceId: string, albumId: string | null) => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useQuery({
    queryKey: albumMediaQueryKey(userId, dockspaceId, albumId ?? ''),
    queryFn: () => listAlbumMedia(dockspaceId, albumId ?? ''),
    enabled: Boolean(userId && dockspaceId && albumId)
  });
};

export const useMediaAlbums = (dockspaceId: string, fileNodeId: string | null) => {
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useQuery({
    queryKey: mediaAlbumsQueryKey(userId, dockspaceId, fileNodeId ?? ''),
    queryFn: () => listMediaAlbums(dockspaceId, fileNodeId ?? ''),
    enabled: Boolean(userId && dockspaceId && fileNodeId)
  });
};

export const useCreateAlbum = (dockspaceId: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: (name: string) => createAlbum(dockspaceId, name),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await queryClient.invalidateQueries({ queryKey: albumsQueryKey(userId, dockspaceId) });
    }
  });
};

export const useRenameAlbum = (dockspaceId: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: ({ albumId, name }: { albumId: string; name: string }) =>
      renameAlbum(dockspaceId, albumId, name),
    onSuccess: async (_result, variables) => {
      if (!userId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: albumsQueryKey(userId, dockspaceId) }),
        queryClient.invalidateQueries({
          queryKey: albumMediaQueryKey(userId, dockspaceId, variables.albumId)
        })
      ]);
    }
  });
};

export const useDeleteAlbum = (dockspaceId: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: (albumId: string) => deleteAlbum(dockspaceId, albumId),
    onSuccess: async () => {
      if (!userId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: albumsQueryKey(userId, dockspaceId) }),
        queryClient.invalidateQueries({ queryKey: ['album-media', userId, dockspaceId] })
      ]);
    }
  });
};

export const useAssignAlbumMedia = (dockspaceId: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: ({ albumId, fileNodeIds }: { albumId: string; fileNodeIds: string[] }) =>
      assignAlbumMedia(dockspaceId, albumId, fileNodeIds),
    onSuccess: async (_result, variables) => {
      if (!userId) {
        return;
      }

      const invalidations: Array<Promise<void>> = [
        queryClient.invalidateQueries({ queryKey: albumsQueryKey(userId, dockspaceId) }),
        queryClient.invalidateQueries({
          queryKey: albumMediaQueryKey(userId, dockspaceId, variables.albumId)
        })
      ];

      for (const fileNodeId of variables.fileNodeIds) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: mediaAlbumsQueryKey(userId, dockspaceId, fileNodeId)
          })
        );
      }

      await Promise.all(invalidations);
    }
  });
};

export const useRemoveAlbumMedia = (dockspaceId: string) => {
  const queryClient = useQueryClient();
  const { session } = useStore(authStore);
  const userId = session?.userId ?? '';

  return useMutation({
    mutationFn: ({ albumId, fileNodeId }: { albumId: string; fileNodeId: string }) =>
      removeAlbumMedia(dockspaceId, albumId, fileNodeId),
    onSuccess: async (_result, variables) => {
      if (!userId) {
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: albumsQueryKey(userId, dockspaceId) }),
        queryClient.invalidateQueries({
          queryKey: albumMediaQueryKey(userId, dockspaceId, variables.albumId)
        }),
        queryClient.invalidateQueries({
          queryKey: mediaAlbumsQueryKey(userId, dockspaceId, variables.fileNodeId)
        })
      ]);
    }
  });
};
