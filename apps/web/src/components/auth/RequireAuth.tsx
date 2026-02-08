import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { PropsWithChildren } from 'react';
import { useAuth } from '@/hooks/useAuth';

export const RequireAuth = ({ children }: PropsWithChildren) => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      void navigate({ to: '/login' });
    }
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
};
