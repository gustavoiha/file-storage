import { Link, useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { FileList } from '@/components/files/FileList';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { useRestoreFile, useTrash } from '@/hooks/useFiles';

export const TrashPage = () => {
  const { vaultId } = useParams({ from: '/vaults/$vaultId/trash' });
  const trashQuery = useTrash(vaultId);
  const restoreMutation = useRestoreFile(vaultId);

  return (
    <RequireAuth>
      <Page title="Trash">
        <Card>
          <Link to="/vaults/$vaultId" params={{ vaultId }}>
            Back to vault
          </Link>
        </Card>
        <Card>
          {trashQuery.isLoading ? (
            <p>Loading...</p>
          ) : (
            <FileList
              files={trashQuery.data ?? []}
              actionLabel="Restore"
              onAction={(fullPath) => {
                void restoreMutation.mutateAsync(fullPath);
              }}
            />
          )}
        </Card>
      </Page>
    </RequireAuth>
  );
};
