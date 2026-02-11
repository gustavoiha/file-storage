import { useMemo, useRef, useState, useCallback, type ChangeEvent, type FormEvent } from 'react';
import { useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { AddFolderDialog } from '@/components/files/AddFolderDialog';
import { FileList } from '@/components/files/FileList';
import { FileViewerDialog } from '@/components/files/FileViewerDialog';
import { RenameFileDialog } from '@/components/files/RenameFileDialog';
import { RenameFolderDialog } from '@/components/files/RenameFolderDialog';
import { UploadFilesDialog } from '@/components/files/UploadFilesDialog';
import { VaultFilesHeaderActions } from '@/components/files/VaultFilesHeaderActions';
import { buildPathInFolder } from '@/components/files/pathHelpers';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { useAddFolderDialog } from '@/hooks/useAddFolderDialog';
import {
  useCreateFolder,
  useFiles,
  useMoveToTrash,
  useRenameFile,
  useRenameFolder,
  useUploadFile
} from '@/hooks/useFiles';
import { useVaultUploadDialog } from '@/hooks/useVaultUploadDialog';
import { useVaults } from '@/hooks/useVaults';
import { ApiError } from '@/lib/apiClient';
import type { FileRecord } from '@/lib/apiTypes';
import { createFileDownloadSession } from '@/lib/vaultApi';

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

const fileNameFromPath = (fullPath: string): string => {
  const segments = fullPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? fullPath;
};

export const VaultFilesPage = () => {
  const { vaultId } = useParams({ from: '/vaults/$vaultId' });
  const [folderTrail, setFolderTrail] = useState<FolderTrailEntry[]>([ROOT_FOLDER]);
  const [isVaultMenuOpen, setIsVaultMenuOpen] = useState(false);
  const [renameFileDialogFullPath, setRenameFileDialogFullPath] = useState<string | null>(null);
  const [renameFileDialogFileName, setRenameFileDialogFileName] = useState('');
  const [renameFileDialogValidationError, setRenameFileDialogValidationError] = useState<
    string | null
  >(null);
  const [renameFolderDialogPath, setRenameFolderDialogPath] = useState<string | null>(null);
  const [renameFolderDialogName, setRenameFolderDialogName] = useState('');
  const [renameFolderDialogValidationError, setRenameFolderDialogValidationError] = useState<
    string | null
  >(null);
  const [viewerFile, setViewerFile] = useState<FileRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentFolder = folderTrail[folderTrail.length - 1] ?? ROOT_FOLDER;

  const vaultsQuery = useVaults();
  const filesQuery = useFiles(vaultId, currentFolder.folderNodeId);
  const createFolder = useCreateFolder(vaultId);
  const moveToTrash = useMoveToTrash(vaultId, currentFolder.fullPath);
  const renameFile = useRenameFile(vaultId, currentFolder.fullPath);
  const renameFolder = useRenameFolder(vaultId, currentFolder.fullPath);
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

  const openFileViewer = useCallback((file: FileRecord) => {
    setViewerFile(file);
  }, []);

  const onDownloadFile = useCallback(
    (file: FileRecord) => {
      const fileNodeId = file.fileNodeId;
      if (!fileNodeId) {
        return;
      }

      void (async () => {
        try {
          const session = await createFileDownloadSession(vaultId, fileNodeId, {
            disposition: 'attachment'
          });
          const link = document.createElement('a');
          link.href = session.downloadUrl;
          document.body.appendChild(link);
          link.click();
          link.remove();
        } catch {
          // Errors are intentionally silent in this action-only flow.
        }
      })();
    },
    [vaultId]
  );

  const openRenameFileDialog = useCallback((fullPath: string) => {
    setRenameFileDialogFullPath(fullPath);
    setRenameFileDialogFileName(fileNameFromPath(fullPath));
    setRenameFileDialogValidationError(null);
  }, []);

  const closeRenameFileDialog = useCallback(() => {
    if (renameFile.isPending) {
      return;
    }

    setRenameFileDialogFullPath(null);
    setRenameFileDialogFileName('');
    setRenameFileDialogValidationError(null);
  }, [renameFile.isPending]);

  const onRenameFileSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!renameFileDialogFullPath) {
        return;
      }

      const newName = renameFileDialogFileName.trim();
      if (!newName) {
        setRenameFileDialogValidationError('File name cannot be empty.');
        return;
      }

      setRenameFileDialogValidationError(null);
      void (async () => {
        try {
          await renameFile.mutateAsync({ fullPath: renameFileDialogFullPath, newName });
          setRenameFileDialogFullPath(null);
          setRenameFileDialogFileName('');
        } catch {
          // Error is surfaced through renameFile.error.
        }
      })();
    },
    [renameFileDialogFileName, renameFileDialogFullPath, renameFile]
  );

  const openRenameFolderDialog = useCallback((folderPath: string) => {
    setRenameFolderDialogPath(folderPath);
    setRenameFolderDialogName(folderNameFromPath(folderPath));
    setRenameFolderDialogValidationError(null);
  }, []);

  const closeRenameFolderDialog = useCallback(() => {
    if (renameFolder.isPending) {
      return;
    }

    setRenameFolderDialogPath(null);
    setRenameFolderDialogName('');
    setRenameFolderDialogValidationError(null);
  }, [renameFolder.isPending]);

  const onRenameFolderSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!renameFolderDialogPath) {
        return;
      }

      const newName = renameFolderDialogName.trim();
      if (!newName) {
        setRenameFolderDialogValidationError('Folder name cannot be empty.');
        return;
      }

      setRenameFolderDialogValidationError(null);
      void (async () => {
        try {
          await renameFolder.mutateAsync({ folderPath: renameFolderDialogPath, newName });
          setRenameFolderDialogPath(null);
          setRenameFolderDialogName('');
        } catch {
          // Error is surfaced through renameFolder.error.
        }
      })();
    },
    [renameFolder, renameFolderDialogName, renameFolderDialogPath]
  );

  const renameFileDialogErrorMessage =
    renameFileDialogValidationError ??
    (renameFile.error instanceof Error ? renameFile.error.message : null);
  const renameFolderDialogErrorMessage =
    renameFolderDialogValidationError ??
    (renameFolder.error instanceof Error ? renameFolder.error.message : null);

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
                  downloadActionLabel="Download"
                  renameActionLabel="Rename"
                  folderRenameActionLabel="Rename"
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
                  onRename={openRenameFileDialog}
                  onRenameFolder={openRenameFolderDialog}
                  onOpenFile={openFileViewer}
                  onDownload={onDownloadFile}
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
            <RenameFileDialog
              errorMessage={renameFileDialogErrorMessage}
              fileName={renameFileDialogFileName}
              isOpen={Boolean(renameFileDialogFullPath)}
              isSubmitting={renameFile.isPending}
              onClose={closeRenameFileDialog}
              onFileNameChange={(nextValue) => {
                setRenameFileDialogFileName(nextValue);
                if (renameFileDialogValidationError) {
                  setRenameFileDialogValidationError(null);
                }
              }}
              onSubmit={onRenameFileSubmit}
            />
            <RenameFolderDialog
              errorMessage={renameFolderDialogErrorMessage}
              folderName={renameFolderDialogName}
              isOpen={Boolean(renameFolderDialogPath)}
              isSubmitting={renameFolder.isPending}
              onClose={closeRenameFolderDialog}
              onFolderNameChange={(nextValue) => {
                setRenameFolderDialogName(nextValue);
                if (renameFolderDialogValidationError) {
                  setRenameFolderDialogValidationError(null);
                }
              }}
              onSubmit={onRenameFolderSubmit}
            />
            {viewerFile ? (
              <FileViewerDialog
                file={viewerFile}
                isOpen
                onClose={() => setViewerFile(null)}
                vaultId={vaultId}
              />
            ) : null}
          </>
        )}
      </Page>
    </RequireAuth>
  );
};
