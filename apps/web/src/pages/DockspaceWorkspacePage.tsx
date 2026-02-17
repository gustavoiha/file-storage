import { Suspense } from 'react';
import { useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { Page } from '@/components/ui/Page';
import { useDockspaces } from '@/hooks/useDockspaces';
import { lazyRouteComponent } from '@tanstack/react-router';

const DockspaceFilesPage = lazyRouteComponent(
  () => import('@/pages/DockspaceFilesPage'),
  'DockspaceFilesPage'
);
const DockspaceMediaPage = lazyRouteComponent(
  () => import('@/pages/DockspaceMediaPage'),
  'DockspaceMediaPage'
);

export const DockspaceWorkspacePage = () => {
  const { dockspaceId } = useParams({ from: '/dockspaces/$dockspaceId' });
  const dockspacesQuery = useDockspaces();
  const dockspace = dockspacesQuery.data?.find((item) => item.dockspaceId === dockspaceId);

  if (!dockspace && dockspacesQuery.isLoading) {
    return (
      <RequireAuth>
        <Page title="Dockspace">
          <p>Loading dockspace...</p>
        </Page>
      </RequireAuth>
    );
  }

  if (dockspace?.dockspaceType === 'PHOTOS_VIDEOS') {
    return (
      <Suspense fallback={<p>Loading dockspace...</p>}>
        <DockspaceMediaPage dockspaceId={dockspaceId} dockspaceName={dockspace.name} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<p>Loading dockspace...</p>}>
      <DockspaceFilesPage />
    </Suspense>
  );
};
