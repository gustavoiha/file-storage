import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { ConfirmPurgeFileDialog } from '@/components/files/ConfirmPurgeFileDialog';
import {
  FileList,
  fileRowId,
  formatTrashedAt,
  type FlatRowFocusRequest
} from '@/components/files/FileList';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { usePurgeFileNow, useRestoreFile, useTrash } from '@/hooks/useFiles';
import type { FileRecord } from '@/lib/apiTypes';
import type { TrashedFileTarget } from '@/lib/dockspaceApi';

const trashedFileTarget = (file: FileRecord): TrashedFileTarget => ({
  fullPath: file.fullPath,
  fileNodeId: file.fileNodeId
});

interface RestoreError {
  /** Trash time of the copy that failed, so a later trashing of the same file node does not inherit it. */
  deletedAt: string | undefined;
  message: string;
}

/** Names the copy that failed the way its row does: path plus trashed date and time. */
const restoreErrorMessage = (file: FileRecord, error: unknown): string => {
  const trashedAt = formatTrashedAt(file);
  const item = trashedAt ? `${file.fullPath} (trashed ${trashedAt})` : file.fullPath;
  const reason = error instanceof Error && error.message ? error.message : 'Failed to restore file.';
  return `Could not restore ${item}: ${reason}`;
};

const withoutKey = <V,>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> => {
  if (!map.has(key)) {
    return map;
  }
  const next = new Map(map);
  next.delete(key);
  return next;
};

export const TrashPage = () => {
  const { dockspaceId } = useParams({ from: '/dockspaces/$dockspaceId/trash' });
  const trashQuery = useTrash(dockspaceId);
  const restoreMutation = useRestoreFile(dockspaceId);
  const purgeMutation = usePurgeFileNow(dockspaceId);
  // Pending state is keyed by row id, not path: the trash can hold several files with one path.
  const [pendingRestoreIds, setPendingRestoreIds] = useState<string[]>([]);
  // Restore errors are kept per row: another row's restore must not hide this row's failure.
  const [restoreErrors, setRestoreErrors] = useState<ReadonlyMap<string, RestoreError>>(
    () => new Map()
  );
  const [purgeTarget, setPurgeTarget] = useState<FileRecord | null>(null);
  const [purgeErrorMessage, setPurgeErrorMessage] = useState<string | null>(null);
  // A restored or purged row leaves the list: focus then moves to a neighbouring row, not <body>.
  const [focusAfterRemoval, setFocusAfterRemoval] = useState<FlatRowFocusRequest | null>(null);

  const onRestore = useCallback(
    (_fullPath: string, file: FileRecord) => {
      const rowId = fileRowId(file);
      setPendingRestoreIds((previous) => (previous.includes(rowId) ? previous : [...previous, rowId]));
      setRestoreErrors((previous) => withoutKey(previous, rowId));
      void (async () => {
        try {
          await restoreMutation.mutateAsync(trashedFileTarget(file));
          setFocusAfterRemoval({ rowId });
        } catch (error) {
          setRestoreErrors((previous) =>
            new Map(previous).set(rowId, {
              deletedAt: file.deletedAt,
              message: restoreErrorMessage(file, error)
            })
          );
        } finally {
          setPendingRestoreIds((previous) => previous.filter((id) => id !== rowId));
        }
      })();
    },
    [restoreMutation]
  );

  const dismissRestoreError = useCallback((rowId: string) => {
    setRestoreErrors((previous) => withoutKey(previous, rowId));
  }, []);

  // Only rows still in the trash, as the same trashed copy, show their error: once an item leaves
  // the trash its error is gone.
  const trashedFiles = trashQuery.data;
  const visibleRestoreErrors = useMemo(() => {
    const visible = new Map<string, string>();
    for (const file of trashedFiles ?? []) {
      const rowId = fileRowId(file);
      const restoreError = restoreErrors.get(rowId);
      if (restoreError && restoreError.deletedAt === file.deletedAt) {
        visible.set(rowId, restoreError.message);
      }
    }
    return visible;
  }, [restoreErrors, trashedFiles]);

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
      const rowId = fileRowId(purgeTarget);
      void (async () => {
        try {
          await purgeMutation.mutateAsync(trashedFileTarget(purgeTarget));
          // Same update as the dialog closing, so focus moves once the dialog is gone.
          setPurgeTarget(null);
          setFocusAfterRemoval({ rowId });
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
          {trashQuery.isLoading ? (
            <p>Loading...</p>
          ) : (
            <FileList
              files={trashedFiles ?? []}
              actionErrorMessages={visibleRestoreErrors}
              onDismissActionError={dismissRestoreError}
              focusAfterRemoval={focusAfterRemoval}
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
