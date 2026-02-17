import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 10_000
    }
  }
});

export const AuthenticatedLayout = () => (
  <QueryClientProvider client={queryClient}>
    <Outlet />
  </QueryClientProvider>
);
