import { Link, useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { usePurged } from '@/hooks/useFiles';

export const PurgedPage = () => {
  const { dockspaceId } = useParams({ from: '/dockspaces/$dockspaceId/purged' });
  const purgedQuery = usePurged(dockspaceId);

  return (
    <RequireAuth>
      <Page title="Purged History">
        <Card>
          <Link to="/dockspaces/$dockspaceId" params={{ dockspaceId }}>
            Back to dockspace
          </Link>
        </Card>
        <Card>
          {purgedQuery.isLoading ? (
            <p>Loading...</p>
          ) : (
            <ul className="resource-list">
              {(purgedQuery.data ?? []).map((item) => (
                <li key={item.fullPath} className="resource-list__item">
                  <strong>{item.fullPath}</strong>
                  <p>{item.purgedAt ?? 'Unknown purge time'}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Page>
    </RequireAuth>
  );
};
