import { QueryClient } from '@tanstack/react-query';

/**
 * The app's single React Query client. It is provided at the root of the app so the top nav
 * (dockspace switcher) and the pages share one cache.
 */
export const appQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 10_000
    }
  }
});
