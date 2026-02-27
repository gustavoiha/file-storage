import { RequireAuth } from '@/components/auth/RequireAuth';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { CreateDockspaceForm } from '@/components/files/CreateDockspaceForm';
import { DockspaceList } from '@/components/files/DockspaceList';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { useDockspaces } from '@/hooks/useDockspaces';
import { ApiError } from '@/lib/apiClient';

export const DockspacesPage = () => {
  const dockspaces = useDockspaces();
  const unauthorized =
    dockspaces.error instanceof ApiError && dockspaces.error.statusCode === 403;

  return (
    <RequireAuth>
      <Page title="Dockspaces">
        {unauthorized ? (
          <UnauthorizedNotice />
        ) : (
          <>
            <Card title="Your Dockspaces">
              {dockspaces.isLoading ? (
                <p>Loading...</p>
              ) : (
                <div className="dockspaces-grid">
                  <DockspaceList dockspaces={dockspaces.data ?? []} />
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
