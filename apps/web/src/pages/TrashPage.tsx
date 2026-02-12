import { Link, useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { FileList } from '@/components/files/FileList';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { useRestoreFile, useTrash } from '@/hooks/useFiles';

export const TrashPage = () => {
  const { dockspaceId } = useParams({ from: '/dockspaces/$dockspaceId/trash' });
  const trashQuery = useTrash(dockspaceId);
  const restoreMutation = useRestoreFile(dockspaceId);

  return (
    <RequireAuth>
      <Page title="Trash">
        <Card>
          <Link to="/dockspaces/$dockspaceId" params={{ dockspaceId }}>
            Back to dockspace
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
