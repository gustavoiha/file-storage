import { Link, useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { usePurged } from '@/hooks/useFiles';

export const PurgedPage = () => {
  const { vaultId } = useParams({ from: '/vaults/$vaultId/purged' });
  const purgedQuery = usePurged(vaultId);

  return (
    <RequireAuth>
      <Page title="Purged History">
        <Card>
          <Link to="/vaults/$vaultId" params={{ vaultId }}>
            Back to vault
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
