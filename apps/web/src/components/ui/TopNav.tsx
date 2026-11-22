import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, CircleUserRound } from 'lucide-react';
import { DockspaceSwitcherBar, DockspaceTabs } from '@/components/ui/DockspaceSwitcher';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentDockspaceId } from '@/hooks/useCurrentDockspaceId';
import { PHONE_LAYOUT_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import '@/styles/layout.css';

export const TopNav = () => {
  const { session, isAuthenticated, logout } = useAuth();
  const [isAuthMenuOpen, setIsAuthMenuOpen] = useState(false);
  const currentDockspaceId = useCurrentDockspaceId();
  const isPhone = useMediaQuery(PHONE_LAYOUT_QUERY);

  if (!isAuthenticated || !session) {
    return null;
  }

  return (
    <div className="app-header">
      <header className="top-nav">
        <Link to="/dockspaces" activeOptions={{ exact: true }} className="top-nav__brand top-nav__brand-link">
          Dockspace
        </Link>
        {currentDockspaceId && !isPhone ? <DockspaceTabs currentDockspaceId={currentDockspaceId} /> : null}
        <nav className="top-nav__links">
          <DropdownMenu className="top-nav__account-menu" isOpen={isAuthMenuOpen} onOpenChange={setIsAuthMenuOpen}>
            <DropdownMenu.Trigger className="top-nav__account-trigger" aria-label="Account actions">
              <CircleUserRound size={16} aria-hidden="true" />
              <span>Account</span>
              <ChevronDown size={14} aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="top-nav__account-dropdown" label="Authentication actions">
              <DropdownMenu.Link asChild className="top-nav__account-item">
                <Link to="/settings/password">Change Password</Link>
              </DropdownMenu.Link>
              <DropdownMenu.Separator />
              <DropdownMenu.Button className="top-nav__account-item" onClick={() => void logout()}>
                Logout
              </DropdownMenu.Button>
            </DropdownMenu.Content>
          </DropdownMenu>
        </nav>
      </header>
      {currentDockspaceId && isPhone ? <DockspaceSwitcherBar currentDockspaceId={currentDockspaceId} /> : null}
    </div>
  );
};
