import { useMemo, useRef, useState, useCallback, type ChangeEvent, type FormEvent } from 'react';
import { useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { AddFolderDialog } from '@/components/files/AddFolderDialog';
import { DockspaceSidebar } from '@/components/files/DockspaceSidebar';
import { FileList } from '@/components/files/FileList';
import { FileViewerDialog } from '@/components/files/FileViewerDialog';
import { RenameFileDialog } from '@/components/files/RenameFileDialog';
import { RenameFolderDialog } from '@/components/files/RenameFolderDialog';
import { DockspaceFilesHeaderActions } from '@/components/files/DockspaceFilesHeaderActions';
import { Button } from '@/components/ui/Button';
import { buildPathInFolder, normalizeNodeName } from '@/components/files/pathHelpers';
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
import { useDockspaceUploadDialog } from '@/hooks/useDockspaceUploadDialog';
import { useDockspaces } from '@/hooks/useDockspaces';
import { ApiError } from '@/lib/apiClient';
import type { FileRecord } from '@/lib/apiTypes';
import { createFileDownloadSession } from '@/lib/dockspaceApi';

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

const parentFolderPathFromPath = (fullPath: string): string => {
  const segments = fullPath.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return '/';
  }

  return `/${segments.slice(0, -1).join('/')}`;
};

const FOLDER_RENAME_CONFLICT_MESSAGE = 'A sibling folder with this name already exists.';

export const DockspaceFilesPage = () => {
  const { dockspaceId } = useParams({ from: '/dockspaces/$dockspaceId' });
  const [folderTrail, setFolderTrail] = useState<FolderTrailEntry[]>([ROOT_FOLDER]);
  const [isDockspaceMenuOpen, setIsDockspaceMenuOpen] = useState(false);
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
  const folderInputRef = useRef<HTMLInputElement>(null);
  const currentFolder = folderTrail[folderTrail.length - 1] ?? ROOT_FOLDER;

  const dockspacesQuery = useDockspaces();
  const filesQuery = useFiles(dockspaceId, currentFolder.folderNodeId);
  const createFolder = useCreateFolder(dockspaceId);
  const moveToTrash = useMoveToTrash(dockspaceId, currentFolder.fullPath);
  const renameFile = useRenameFile(dockspaceId, currentFolder.fullPath);
  const renameFolder = useRenameFolder(dockspaceId, currentFolder.fullPath);
  const uploadFile = useUploadFile(dockspaceId, currentFolder.fullPath);

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

  const uploadDialog = useDockspaceUploadDialog({
    currentFolderPath: currentFolder.fullPath,
    uploadFile: uploadFile.mutateAsync
  });

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const openFolderPicker = useCallback(() => {
    folderInputRef.current?.click();
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

  const onUploadFolderSelection = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      uploadDialog.stageFolderFiles(selectedFiles);

      if (folderInputRef.current) {
        folderInputRef.current.value = '';
      }
    },
    [uploadDialog.stageFolderFiles]
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
          const session = await createFileDownloadSession(dockspaceId, fileNodeId, {
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
    [dockspaceId]
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

      const targetParentPath = parentFolderPathFromPath(renameFolderDialogPath);
      const normalizedTargetName = normalizeNodeName(newName);
      const hasSiblingConflict = folders.some((folder) => {
        if (folder.fullPath === renameFolderDialogPath) {
          return false;
        }

        if (parentFolderPathFromPath(folder.fullPath) !== targetParentPath) {
          return false;
        }

        return normalizeNodeName(folder.name) === normalizedTargetName;
      });

      if (hasSiblingConflict) {
        setRenameFolderDialogValidationError(FOLDER_RENAME_CONFLICT_MESSAGE);
        return;
      }

      setRenameFolderDialogValidationError(null);
      void (async () => {
        try {
          await renameFolder.mutateAsync({ folderPath: renameFolderDialogPath, newName });
          setRenameFolderDialogPath(null);
          setRenameFolderDialogName('');
        } catch (error) {
          if (error instanceof ApiError && error.statusCode === 409) {
            setRenameFolderDialogValidationError(FOLDER_RENAME_CONFLICT_MESSAGE);
          }
        }
      })();
    },
    [folders, renameFolder, renameFolderDialogName, renameFolderDialogPath]
  );

  const renameFileDialogErrorMessage =
    renameFileDialogValidationError ??
    (renameFile.error instanceof Error ? renameFile.error.message : null);
  const renameFolderDialogErrorMessage =
    renameFolderDialogValidationError ??
    (renameFolder.error instanceof Error ? renameFolder.error.message : null);

  const uploadErrorMessage =
    uploadDialog.validationError ?? (uploadFile.error instanceof Error ? uploadFile.error.message : null);
  const dockspaceName =
    dockspacesQuery.data?.find((dockspace) => dockspace.dockspaceId === dockspaceId)?.name ?? 'Dockspace';
  const pendingUploadFiles = useMemo(
    () =>
      uploadDialog.activeUploads.map((upload) => ({
        fullPath: upload.fullPath,
        progress: upload.progress,
        status: upload.status
      })),
    [uploadDialog.activeUploads]
  );
  const pendingUploadFolderPaths = useMemo(() => {
    const folderPaths = new Set<string>();

    for (const upload of uploadDialog.activeUploads) {
      const segments = upload.fullPath.split('/').filter(Boolean);
      if (segments.length <= 1) {
        continue;
      }

      let runningPath = '';
      for (let index = 0; index < segments.length - 1; index += 1) {
        runningPath += `/${segments[index]}`;
        folderPaths.add(runningPath);
      }
    }

    return Array.from(folderPaths);
  }, [uploadDialog.activeUploads]);

  const emptyDockspaceState = (
    <div className="dockspace-browser-empty">
      <svg
        className="dockspace-browser-empty__image"
        viewBox="0 0 760 420"
        role="img"
        aria-label="Empty folder illustration"
      >
        <defs>
          <linearGradient id="dockspace-empty-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(114, 196, 255, 0.35)" />
            <stop offset="100%" stopColor="rgba(47, 121, 201, 0.15)" />
          </linearGradient>
          <linearGradient id="dockspace-empty-folder" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(228, 236, 247, 0.95)" />
            <stop offset="100%" stopColor="rgba(145, 161, 184, 0.92)" />
          </linearGradient>
        </defs>
        <rect x="24" y="16" width="712" height="388" rx="36" fill="url(#dockspace-empty-bg)" />
        <path
          d="M196 112h118l28 44h222c30 0 54 24 54 54v64c0 30-24 54-54 54H196c-30 0-54-24-54-54v-108c0-30 24-54 54-54z"
          fill="url(#dockspace-empty-folder)"
        />
        <path
          d="M380 182v72m0 0-28-28m28 28 28-28"
          stroke="rgba(24, 36, 54, 0.72)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="590" cy="120" r="22" fill="rgba(132, 220, 170, 0.82)" />
        <circle cx="624" cy="94" r="12" fill="rgba(126, 203, 255, 0.8)" />
      </svg>
      <p className="dockspace-browser-empty__title">This folder is empty</p>
      <p className="dockspace-browser-empty__message">
        Upload your first files to start organizing your dockspace.
      </p>
      <Button type="button" onClick={openFilePicker}>
        Upload your first files
      </Button>
    </div>
  );

  return (
    <RequireAuth>
      <Page className="page--dockspace">
        {unauthorized ? (
          <UnauthorizedNotice />
        ) : (
          <>
            <div className="dockspace-page-shell">
              <div className="dockspace-page-main">
                <Card>
                  {filesQuery.isLoading ? (
                    <p>Loading...</p>
                  ) : (
                    <FileList
                      files={files}
                      folders={folders}
                      currentFolder={currentFolder.fullPath}
                      pendingFolderPaths={addFolderDialog.pendingFolderPaths}
                      pendingUploadFiles={pendingUploadFiles}
                      pendingUploadFolderPaths={pendingUploadFolderPaths}
                      actionLabel="Move to Trash"
                      downloadActionLabel="Download"
                      renameActionLabel="Rename"
                      folderRenameActionLabel="Rename"
                      emptyState={emptyDockspaceState}
                      rootBreadcrumbLabel={dockspaceName}
                      toolbarActions={
                        <DockspaceFilesHeaderActions
                          fileInputRef={fileInputRef}
                          folderInputRef={folderInputRef}
                          isMenuOpen={isDockspaceMenuOpen}
                          onMenuOpenChange={setIsDockspaceMenuOpen}
                          dockspaceId={dockspaceId}
                          onAddFolder={() => {
                            addFolderDialog.openDialog();
                          }}
                          onUploadFolder={() => {
                            openFolderPicker();
                          }}
                          onUploadFiles={() => {
                            openFilePicker();
                          }}
                          onUploadFolderSelection={onUploadFolderSelection}
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
              </div>
              <DockspaceSidebar
                activeUploads={uploadDialog.activeUploads}
                uploadErrorMessage={uploadErrorMessage}
                onAddFolder={addFolderDialog.openDialog}
                onUploadFiles={openFilePicker}
                onUploadFolder={openFolderPicker}
              />
            </div>
            <AddFolderDialog
              errorMessage={addFolderDialog.errorMessage}
              folderName={addFolderDialog.folderName}
              isOpen={addFolderDialog.isDialogOpen}
              isSubmitting={createFolder.isPending}
              onClose={addFolderDialog.closeDialog}
              onFolderNameChange={addFolderDialog.onFolderNameChange}
              onSubmit={addFolderDialog.onSubmit}
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
                dockspaceId={dockspaceId}
              />
            ) : null}
          </>
        )}
      </Page>
    </RequireAuth>
  );
};
