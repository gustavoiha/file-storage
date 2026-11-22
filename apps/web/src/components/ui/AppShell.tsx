import { type CSSProperties, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Outlet } from '@tanstack/react-router';
import { TopNav } from '@/components/ui/TopNav';
import { useDockspaceSwitcherVariant } from '@/components/ui/DockspaceSwitcher';
import { useElementHeight } from '@/hooks/useElementHeight';
import { appQueryClient } from '@/lib/queryClient';
import '@/styles/layout.css';

const AppShellLayout = () => {
  const switcherVariant = useDockspaceSwitcherVariant();
  // Full-height pages size themselves with --app-top-nav-height. The header's height is not fixed (on narrow
  // screens the top nav stacks its rows, and the phone switcher bar sits under it), so the measured height replaces
  // the CSS estimate once known.
  const [header, setHeader] = useState<HTMLDivElement | null>(null);
  const headerHeight = useElementHeight(header);
  const bodyStyle = headerHeight > 0 ? ({ '--app-top-nav-height': `${headerHeight}px` } as CSSProperties) : undefined;

  return (
    <div className={`app-shell${switcherVariant === 'bar' ? ' app-shell--switcher-bar' : ''}`}>
      <TopNav headerRef={setHeader} />
      <div className="app-shell__body" style={bodyStyle}>
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
