import { Link, useParams } from '@tanstack/react-router';
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { AddFolderDialog } from '@/components/files/AddFolderDialog';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { FileList } from '@/components/files/FileList';
import { buildPathInFolder, isValidFileName } from '@/components/files/pathHelpers';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { useAddFolderDialog } from '@/hooks/useAddFolderDialog';
import { useCreateFolder, useFiles, useMoveToTrash, useUploadFile } from '@/hooks/useFiles';
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

interface StagedUploadFile {
  id: number;
  file: File;
  name: string;
}

export const VaultFilesPage = () => {
  const { vaultId } = useParams({ from: '/vaults/$vaultId' });
  const [folderTrail, setFolderTrail] = useState<FolderTrailEntry[]>([ROOT_FOLDER]);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedUploadFile[]>([]);
  const [uploadDialogError, setUploadDialogError] = useState<string | null>(null);
  const [isVaultMenuOpen, setIsVaultMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextUploadIdRef = useRef(1);
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
    [filesQuery.data?.items, currentFolder.fullPath]
  );

  const files = useMemo(
    () =>
      (filesQuery.data?.items ?? [])
        .filter((item) => item.childType === 'file')
        .map((item) => ({
          fileNodeId: item.childId,
          fullPath: buildPathInFolder(currentFolder.fullPath, item.name)
        })),
    [filesQuery.data?.items, currentFolder.fullPath]
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

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const onUploadSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    if (!selected.length) {
      return;
    }

    setStagedFiles((previous) => [
      ...previous,
      ...selected.map((file) => ({
        id: nextUploadIdRef.current++,
        file,
        name: file.name
      }))
    ]);
    setUploadDialogError(null);
    setIsUploadDialogOpen(true);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const closeUploadDialog = () => {
    setIsUploadDialogOpen(false);
    setUploadDialogError(null);
  };

  const onUploadFileNameChange = (id: number, name: string) => {
    setStagedFiles((previous) =>
      previous.map((item) => (item.id === id ? { ...item, name } : item))
    );
    setUploadDialogError(null);
  };

  const removeStagedFile = (id: number) => {
    setStagedFiles((previous) => previous.filter((item) => item.id !== id));
    setUploadDialogError(null);
  };

  const onSubmitUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!stagedFiles.length) {
      return;
    }

    for (const stagedFile of stagedFiles) {
      if (!isValidFileName(stagedFile.name)) {
        setUploadDialogError('Each selected file needs a valid name (no slashes).');
        return;
      }
    }

    setUploadDialogError(null);

    for (const stagedFile of stagedFiles) {
      await uploadFile.mutateAsync({
        fullPath: buildPathInFolder(currentFolder.fullPath, stagedFile.name),
        file: stagedFile.file
      });
    }

    setStagedFiles([]);
    setIsUploadDialogOpen(false);
  };

  const uploadErrorMessage =
    uploadDialogError ?? (uploadFile.error instanceof Error ? uploadFile.error.message : null);
  const vaultName = vaultsQuery.data?.find((vault) => vault.vaultId === vaultId)?.name ?? 'Vault';

  return (
    <RequireAuth>
      <Page
        title={vaultName}
        headerActions={
          <div className="vault-page-menu">
            <input
              ref={fileInputRef}
              className="vault-files__hidden-input"
              type="file"
              multiple
              onChange={onUploadSelection}
            />
            <button
              type="button"
              className="vault-page-menu__trigger"
              aria-label="Vault options"
              aria-expanded={isVaultMenuOpen}
              onClick={() => setIsVaultMenuOpen((previous) => !previous)}
            >
              ⋯
            </button>
            {isVaultMenuOpen ? (
              <div className="vault-page-menu__dropdown" role="menu" aria-label="Vault actions">
                <button
                  type="button"
                  className="vault-page-menu__item vault-page-menu__item--button"
                  onClick={() => {
                    addFolderDialog.openDialog();
                    setIsVaultMenuOpen(false);
                  }}
                >
                  + Add folder
                </button>
                <button
                  type="button"
                  className="vault-page-menu__item vault-page-menu__item--button"
                  onClick={() => {
                    setIsVaultMenuOpen(false);
                    openFilePicker();
                  }}
                >
                  Upload files
                </button>
                <Link
                  to="/vaults/$vaultId/trash"
                  params={{ vaultId }}
                  className="vault-page-menu__item"
                  onClick={() => setIsVaultMenuOpen(false)}
                >
                  Trash
                </Link>
              </div>
            ) : null}
          </div>
        }
      >
        {unauthorized ? (
          <UnauthorizedNotice />
        ) : (
          <>
            <Card title="Files">
              {filesQuery.isLoading ? (
                <p>Loading...</p>
              ) : (
                <FileList
                  files={files}
                  folders={folders}
                  currentFolder={currentFolder.fullPath}
                  pendingFolderPaths={addFolderDialog.pendingFolderPaths}
                  actionLabel="Move to Trash"
                  onOpenFolder={(nextFolder) => {
                    const nextFolderNodeId = folderNodeIdByPath.get(nextFolder);
                    if (!nextFolderNodeId) {
                      return;
                    }

                    setFolderTrail((previous) => {
                      const existingIndex = previous.findIndex(
                        (trailEntry) => trailEntry.fullPath === nextFolder
                      );
                      if (existingIndex >= 0) {
                        return previous.slice(0, existingIndex + 1);
                      }

                      const folderName =
                        folders.find((entry) => entry.fullPath === nextFolder)?.name ??
                        (() => {
                          const segments = nextFolder.split('/').filter(Boolean);
                          return segments[segments.length - 1];
                        })() ??
                        nextFolder;

                      return [
                        ...previous,
                        {
                          folderNodeId: nextFolderNodeId,
                          fullPath: nextFolder,
                          name: folderName
                        }
                      ];
                    });
                  }}
                  onAction={(fullPath) => {
                    void moveToTrash.mutateAsync(fullPath);
                  }}
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
            {isUploadDialogOpen ? (
              <div className="vault-dialog-backdrop" role="presentation">
                <div className="vault-dialog vault-dialog--wide" role="dialog" aria-modal="true" aria-label="Upload files">
                  <h3 className="vault-dialog__title">Upload files</h3>
                  <form onSubmit={onSubmitUpload}>
                    {stagedFiles.length ? (
                      <ul className="upload-staging-list">
                        {stagedFiles.map((stagedFile) => (
                          <li key={stagedFile.id} className="upload-staging-list__item">
                            <p className="upload-staging-list__meta">
                              Original file: {stagedFile.file.name} ({stagedFile.file.size} bytes)
                            </p>
                            <label className="ui-field" htmlFor={`upload-name-${stagedFile.id}`}>
                              <span className="ui-field__label">File name</span>
                              <input
                                id={`upload-name-${stagedFile.id}`}
                                className="ui-input"
                                value={stagedFile.name}
                                onChange={(event) =>
                                  onUploadFileNameChange(stagedFile.id, event.target.value)
                                }
                                disabled={uploadFile.isPending}
                              />
                            </label>
                            <div className="upload-staging-list__actions">
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => removeStagedFile(stagedFile.id)}
                                disabled={uploadFile.isPending}
                              >
                                Remove
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="auth-note">No files selected.</p>
                    )}
                    {uploadErrorMessage ? <Alert message={uploadErrorMessage} /> : null}
                    <div className="vault-dialog__actions">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={openFilePicker}
                        disabled={uploadFile.isPending}
                      >
                        Add more files
                      </Button>
                      <Button type="submit" disabled={uploadFile.isPending || !stagedFiles.length}>
                        {uploadFile.isPending ? 'Uploading...' : 'Upload'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={closeUploadDialog}
                        disabled={uploadFile.isPending}
                      >
                        Close
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Page>
    </RequireAuth>
  );
};
