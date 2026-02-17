import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { hydrateAuthStore } from '@/lib/authStore';
import { router } from '@/router/router';
import '@/styles/theme.css';
import '@/styles/layout.css';

hydrateAuthStore();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
