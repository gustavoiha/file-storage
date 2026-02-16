import { useCallback, useState, type FormEvent } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { ConfirmPurgeFileDialog } from '@/components/files/ConfirmPurgeFileDialog';
import { FileList } from '@/components/files/FileList';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { usePurgeFileNow, useRestoreFile, useTrash } from '@/hooks/useFiles';

export const TrashPage = () => {
  const { dockspaceId } = useParams({ from: '/dockspaces/$dockspaceId/trash' });
  const trashQuery = useTrash(dockspaceId);
  const restoreMutation = useRestoreFile(dockspaceId);
  const purgeMutation = usePurgeFileNow(dockspaceId);
  const [pendingRestorePath, setPendingRestorePath] = useState<string | null>(null);
  const [purgeFilePath, setPurgeFilePath] = useState<string | null>(null);
  const [purgeErrorMessage, setPurgeErrorMessage] = useState<string | null>(null);

  const onRestore = useCallback(
    (fullPath: string) => {
      setPendingRestorePath(fullPath);
      void (async () => {
        try {
          await restoreMutation.mutateAsync(fullPath);
        } finally {
          setPendingRestorePath((previous) => (previous === fullPath ? null : previous));
        }
      })();
    },
    [restoreMutation]
  );

  const openPurgeDialog = useCallback((fullPath: string) => {
    setPurgeFilePath(fullPath);
    setPurgeErrorMessage(null);
  }, []);

  const closePurgeDialog = useCallback(() => {
    if (purgeMutation.isPending) {
      return;
    }

    setPurgeFilePath(null);
    setPurgeErrorMessage(null);
  }, [purgeMutation.isPending]);

  const onPurgeSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!purgeFilePath) {
        return;
      }

      setPurgeErrorMessage(null);
      void (async () => {
        try {
          await purgeMutation.mutateAsync(purgeFilePath);
          setPurgeFilePath(null);
        } catch (error) {
          setPurgeErrorMessage(error instanceof Error ? error.message : 'Failed to purge file.');
        }
      })();
    },
    [purgeFilePath, purgeMutation]
  );

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
              actionLabelWhilePending="Restoring..."
              pendingActionPath={pendingRestorePath}
              secondaryActionLabel="Purge now"
              secondaryActionLabelWhilePending="Purging..."
              pendingSecondaryActionPath={purgeMutation.isPending ? purgeFilePath : null}
              secondaryActionVariant="danger"
              onAction={onRestore}
              onSecondaryAction={openPurgeDialog}
            />
          )}
        </Card>
        <ConfirmPurgeFileDialog
          errorMessage={purgeErrorMessage}
          fullPath={purgeFilePath}
          isOpen={Boolean(purgeFilePath)}
          isSubmitting={purgeMutation.isPending}
          onClose={closePurgeDialog}
          onSubmit={onPurgeSubmit}
        />
      </Page>
    </RequireAuth>
  );
};
