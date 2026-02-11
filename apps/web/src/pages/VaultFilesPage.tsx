import { useMemo, useRef, useState, useCallback, type ChangeEvent } from 'react';
import { useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { AddFolderDialog } from '@/components/files/AddFolderDialog';
import { FileList } from '@/components/files/FileList';
import { UploadFilesDialog } from '@/components/files/UploadFilesDialog';
import { VaultFilesHeaderActions } from '@/components/files/VaultFilesHeaderActions';
import { buildPathInFolder } from '@/components/files/pathHelpers';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { useAddFolderDialog } from '@/hooks/useAddFolderDialog';
import { useCreateFolder, useFiles, useMoveToTrash, useUploadFile } from '@/hooks/useFiles';
import { useVaultUploadDialog } from '@/hooks/useVaultUploadDialog';
import { useVaults } from '@/hooks/useVaults';
import { ApiError } from '@/lib/apiClient';

interface FolderTrailEntry {
  folderNodeId: string;
  fullPath: string;
  name: string;
}

const ROOT_FOLDER: FolderTrailEntry = {
  folderNodeId: 'root',
  fullPath: '/',
  name: 'Root'
};

const folderNameFromPath = (folderPath: string): string => {
  const segments = folderPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? folderPath;
};

export const VaultFilesPage = () => {
  const { vaultId } = useParams({ from: '/vaults/$vaultId' });
  const [folderTrail, setFolderTrail] = useState<FolderTrailEntry[]>([ROOT_FOLDER]);
  const [isVaultMenuOpen, setIsVaultMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentFolder = folderTrail[folderTrail.length - 1] ?? ROOT_FOLDER;

  const vaultsQuery = useVaults();
  const filesQuery = useFiles(vaultId, currentFolder.folderNodeId);
  const createFolder = useCreateFolder(vaultId);
  const moveToTrash = useMoveToTrash(vaultId, currentFolder.fullPath);
  const uploadFile = useUploadFile(vaultId, currentFolder.fullPath);

  const unauthorized =
    filesQuery.error instanceof ApiError && filesQuery.error.statusCode === 403;

  const folders = useMemo(
    () =>
      (filesQuery.data?.items ?? [])
        .filter((item) => item.childType === 'folder')
        .map((item) => ({
          folderNodeId: item.childId,
          parentFolderNodeId: item.parentFolderNodeId,
          fullPath: buildPathInFolder(currentFolder.fullPath, item.name),
          name: item.name,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        })),
    [currentFolder.fullPath, filesQuery.data?.items]
  );

  const files = useMemo(
    () =>
      (filesQuery.data?.items ?? [])
        .filter((item) => item.childType === 'file')
        .map((item) => ({
          fileNodeId: item.childId,
          fullPath: buildPathInFolder(currentFolder.fullPath, item.name)
        })),
    [currentFolder.fullPath, filesQuery.data?.items]
  );

  const folderNodeIdByPath = useMemo(() => {
    const entries = new Map<string, string>();

    for (const trailEntry of folderTrail) {
      entries.set(trailEntry.fullPath, trailEntry.folderNodeId);
    }

    for (const item of folders) {
      entries.set(item.fullPath, item.folderNodeId);
    }

    return entries;
  }, [folderTrail, folders]);

  const fetchedFolderPaths = useMemo(
    () => folders.map((folder) => folder.fullPath),
    [folders]
  );

  const addFolderDialog = useAddFolderDialog({
    createFolder: createFolder.mutateAsync,
    currentFolderPath: currentFolder.fullPath,
    fetchedFolderPaths
  });

  const uploadDialog = useVaultUploadDialog({
    currentFolderPath: currentFolder.fullPath,
    uploadFile: uploadFile.mutateAsync
  });

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onUploadSelection = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      uploadDialog.stageFiles(selectedFiles);

      // Allow selecting the same files again in the next picker interaction.
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [uploadDialog.stageFiles]
  );

  const onOpenFolder = useCallback(
    (nextFolderPath: string) => {
      const nextFolderNodeId = folderNodeIdByPath.get(nextFolderPath);
      if (!nextFolderNodeId) {
        return;
      }

      setFolderTrail((previous) => {
        const existingIndex = previous.findIndex(
          (trailEntry) => trailEntry.fullPath === nextFolderPath
        );
        if (existingIndex >= 0) {
          return previous.slice(0, existingIndex + 1);
        }

        const nextFolderName =
          folders.find((folderEntry) => folderEntry.fullPath === nextFolderPath)?.name ??
          folderNameFromPath(nextFolderPath);

        return [
          ...previous,
          {
            folderNodeId: nextFolderNodeId,
            fullPath: nextFolderPath,
            name: nextFolderName
          }
        ];
      });
    },
    [folderNodeIdByPath, folders]
  );

  const onMoveToTrash = useCallback(
    (fullPath: string) => {
      void moveToTrash.mutateAsync(fullPath);
    },
    [moveToTrash]
  );

  const uploadErrorMessage =
    uploadDialog.validationError ??
    (uploadFile.error instanceof Error ? uploadFile.error.message : null);
  const vaultName =
    vaultsQuery.data?.find((vault) => vault.vaultId === vaultId)?.name ?? 'Vault';

  return (
    <RequireAuth>
      <Page>
        {unauthorized ? (
          <UnauthorizedNotice />
        ) : (
          <>
            <Card>
              {filesQuery.isLoading ? (
                <p>Loading...</p>
              ) : (
                <FileList
                  files={files}
                  folders={folders}
                  currentFolder={currentFolder.fullPath}
                  pendingFolderPaths={addFolderDialog.pendingFolderPaths}
                  actionLabel="Move to Trash"
                  rootBreadcrumbLabel={vaultName}
                  toolbarActions={
                    <VaultFilesHeaderActions
                      fileInputRef={fileInputRef}
                      isMenuOpen={isVaultMenuOpen}
                      onMenuOpenChange={setIsVaultMenuOpen}
                      vaultId={vaultId}
                      onAddFolder={() => {
                        addFolderDialog.openDialog();
                      }}
                      onUploadFiles={() => {
                        openFilePicker();
                      }}
                      onUploadSelection={onUploadSelection}
                    />
                  }
                  onOpenFolder={onOpenFolder}
                  onAction={onMoveToTrash}
                />
              )}
            </Card>
            <AddFolderDialog
              errorMessage={addFolderDialog.errorMessage}
              folderName={addFolderDialog.folderName}
              isOpen={addFolderDialog.isDialogOpen}
              isSubmitting={createFolder.isPending}
              onClose={addFolderDialog.closeDialog}
              onFolderNameChange={addFolderDialog.onFolderNameChange}
              onSubmit={addFolderDialog.onSubmit}
            />
            <UploadFilesDialog
              errorMessage={uploadErrorMessage}
              isOpen={uploadDialog.isDialogOpen}
              isSubmitting={uploadFile.isPending}
              stagedFiles={uploadDialog.stagedFiles}
              onAddMoreFiles={openFilePicker}
              onClose={uploadDialog.closeDialog}
              onFileNameChange={uploadDialog.onFileNameChange}
              onRemoveFile={uploadDialog.removeStagedFile}
              onSubmit={uploadDialog.onSubmit}
            />
          </>
        )}
      </Page>
    </RequireAuth>
  );
};
