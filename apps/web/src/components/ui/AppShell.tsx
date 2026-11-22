import { QueryClientProvider } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { TopNav } from '@/components/ui/TopNav';
import { useDockspaceSwitcherVariant } from '@/components/ui/DockspaceSwitcher';
import { appQueryClient } from '@/lib/queryClient';
import '@/styles/layout.css';

const AppShellLayout = () => {
  const switcherVariant = useDockspaceSwitcherVariant();

  return (
    <div className={`app-shell${switcherVariant === 'bar' ? ' app-shell--switcher-bar' : ''}`}>
      <TopNav />
      <div className="app-shell__body">
        <Outlet />
      </div>
    </div>
  );
};

export const AppShell = () => (
  <QueryClientProvider client={appQueryClient}>
    <AppShellLayout />
  </QueryClientProvider>
);
