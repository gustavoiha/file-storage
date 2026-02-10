import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { configureAmplify } from '@/lib/amplify';
import { hydrateAuthStore } from '@/lib/authStore';
import { router } from '@/router/router';
import '@/styles/theme.css';
import '@/styles/layout.css';

configureAmplify();
hydrateAuthStore();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 10_000
    }
  }
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
