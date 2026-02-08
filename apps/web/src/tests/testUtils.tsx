import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

export const QueryWrapper = ({
  client,
  children
}: PropsWithChildren<{ client: QueryClient }>) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
