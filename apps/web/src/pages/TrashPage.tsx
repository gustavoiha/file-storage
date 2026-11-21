import { useCallback, useState, type FormEvent } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { ConfirmPurgeFileDialog } from '@/components/files/ConfirmPurgeFileDialog';
import { FileList, fileRowId, formatTrashedAt } from '@/components/files/FileList';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { usePurgeFileNow, useRestoreFile, useTrash } from '@/hooks/useFiles';
import type { FileRecord } from '@/lib/apiTypes';
import type { TrashedFileTarget } from '@/lib/dockspaceApi';

const trashedFileTarget = (file: FileRecord): TrashedFileTarget => ({
  fullPath: file.fullPath,
  fileNodeId: file.fileNodeId
});

export const TrashPage = () => {
  const { dockspaceId } = useParams({ from: '/dockspaces/$dockspaceId/trash' });
  const trashQuery = useTrash(dockspaceId);
  const restoreMutation = useRestoreFile(dockspaceId);
  const purgeMutation = usePurgeFileNow(dockspaceId);
  // Pending state is keyed by row id, not path: the trash can hold several files with one path.
  const [pendingRestoreIds, setPendingRestoreIds] = useState<string[]>([]);
  const [restoreErrorMessage, setRestoreErrorMessage] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<FileRecord | null>(null);
  const [purgeErrorMessage, setPurgeErrorMessage] = useState<string | null>(null);

  const onRestore = useCallback(
    (_fullPath: string, file: FileRecord) => {
      const rowId = fileRowId(file);
      setPendingRestoreIds((previous) => (previous.includes(rowId) ? previous : [...previous, rowId]));
      setRestoreErrorMessage(null);
      void (async () => {
        try {
          await restoreMutation.mutateAsync(trashedFileTarget(file));
        } catch (error) {
          setRestoreErrorMessage(error instanceof Error ? error.message : 'Failed to restore file.');
        } finally {
          setPendingRestoreIds((previous) => previous.filter((id) => id !== rowId));
        }
      })();
    },
    [restoreMutation]
  );

  const openPurgeDialog = useCallback((_fullPath: string, file: FileRecord) => {
    setPurgeTarget(file);
    setPurgeErrorMessage(null);
  }, []);

  const closePurgeDialog = useCallback(() => {
    if (purgeMutation.isPending) {
      return;
    }

    setPurgeTarget(null);
    setPurgeErrorMessage(null);
  }, [purgeMutation.isPending]);

  const onPurgeSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!purgeTarget) {
        return;
      }

      setPurgeErrorMessage(null);
      void (async () => {
        try {
          await purgeMutation.mutateAsync(trashedFileTarget(purgeTarget));
          setPurgeTarget(null);
        } catch (error) {
          setPurgeErrorMessage(error instanceof Error ? error.message : 'Failed to purge file.');
        }
      })();
    },
    [purgeTarget, purgeMutation]
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
          {restoreErrorMessage ? <Alert message={restoreErrorMessage} /> : null}
          {trashQuery.isLoading ? (
            <p>Loading...</p>
          ) : (
            <FileList
              files={trashQuery.data ?? []}
              actionLabel="Restore"
              actionLabelWhilePending="Restoring..."
              pendingActionFileIds={pendingRestoreIds}
              secondaryActionLabel="Purge now"
              secondaryActionLabelWhilePending="Purging..."
              pendingSecondaryActionFileIds={
                purgeMutation.isPending && purgeTarget ? [fileRowId(purgeTarget)] : []
              }
              secondaryActionVariant="danger"
              onAction={onRestore}
              onSecondaryAction={openPurgeDialog}
            />
          )}
        </Card>
        <ConfirmPurgeFileDialog
          errorMessage={purgeErrorMessage}
          fullPath={purgeTarget?.fullPath ?? null}
          trashedAt={purgeTarget ? formatTrashedAt(purgeTarget) : null}
          isOpen={Boolean(purgeTarget)}
          isSubmitting={purgeMutation.isPending}
          onClose={closePurgeDialog}
          onSubmit={onPurgeSubmit}
        />
      </Page>
    </RequireAuth>
  );
};
