import { useRef } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { CreateDockspaceForm } from '@/components/files/CreateDockspaceForm';
import { DockspaceList } from '@/components/files/DockspaceList';
import { DockspaceListLoadError } from '@/components/files/DockspaceListLoadError';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { useDockspaceListLoad } from '@/hooks/useDockspaceListLoad';

export const DOCKSPACES_LOAD_ERROR_MESSAGE = "Couldn't load dockspaces.";

export const DockspacesPage = () => {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const dockspaceList = useDockspaceListLoad({
    // After Try again loads the list: the first card (a dockspace, or a create card for an empty account). Not
    // Authorized (a retry that returns 403) has no control: the page title.
    getFocusTarget: () =>
      gridRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])') ?? titleRef.current
  });

  return (
    <RequireAuth>
      <Page title="Dockspaces" titleRef={titleRef}>
        {dockspaceList.unauthorized ? (
          <UnauthorizedNotice />
        ) : (
          <>
            <Card title="Your Dockspaces">
              {dockspaceList.showLoadError ? (
                // A failed list shows only the error: an empty-looking grid with the create cards would invite
                // creating a dockspace that already exists.
                <DockspaceListLoadError
                  message={DOCKSPACES_LOAD_ERROR_MESSAGE}
                  isRetrying={dockspaceList.isRetrying}
                  onRetry={dockspaceList.retry}
                  focusHandlers={dockspaceList.retryFocusHandlers}
                />
              ) : dockspaceList.isLoading ? (
                <p>Loading...</p>
              ) : (
                <div ref={gridRef} className="dockspaces-grid">
                  <DockspaceList dockspaces={dockspaceList.dockspaces ?? []} />
                  <CreateDockspaceForm />
                </div>
              )}
            </Card>
          </>
        )}
      </Page>
    </RequireAuth>
  );
};
