import { Suspense } from 'react';
import { useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { Page } from '@/components/ui/Page';
import { SuspenseLoader } from '@/components/ui/SuspenseLoader';
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
          <SuspenseLoader label="Loading dockspace..." />
        </Page>
      </RequireAuth>
    );
  }

  if (dockspace?.dockspaceType === 'PHOTOS_VIDEOS') {
    return (
      <Suspense fallback={<SuspenseLoader label="Loading dockspace..." />}>
        <DockspaceMediaPage dockspaceId={dockspaceId} dockspaceName={dockspace.name} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<SuspenseLoader label="Loading dockspace..." />}>
      <DockspaceFilesPage />
    </Suspense>
  );
};
