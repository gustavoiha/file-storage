import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { FileList } from '@/components/files/FileList';
import { UploadForm } from '@/components/files/UploadForm';
import { buildPathInFolder } from '@/components/files/pathHelpers';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { useCreateFolder, useFiles, useMoveToTrash } from '@/hooks/useFiles';
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

export const VaultFilesPage = () => {
  const { vaultId } = useParams({ from: '/vaults/$vaultId' });
  const [folderTrail, setFolderTrail] = useState<FolderTrailEntry[]>([ROOT_FOLDER]);
  const [pendingFolderPaths, setPendingFolderPaths] = useState<string[]>([]);
  const currentFolder = folderTrail[folderTrail.length - 1] ?? ROOT_FOLDER;
  const filesQuery = useFiles(vaultId, currentFolder.folderNodeId);
  const createFolder = useCreateFolder(vaultId);
  const moveToTrash = useMoveToTrash(vaultId, currentFolder.fullPath);
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

  useEffect(() => {
    const fetchedPaths = new Set(folders.map((item) => item.fullPath));

    setPendingFolderPaths((previous) =>
      previous.filter((pendingPath) => !fetchedPaths.has(pendingPath))
    );
  }, [folders]);

  return (
    <RequireAuth>
      <Page title={`Vault ${vaultId}`}>
        {unauthorized ? (
          <UnauthorizedNotice />
        ) : (
          <>
            <Card>
              <div className="inline-links">
                <Link to="/vaults/$vaultId/trash" params={{ vaultId }}>
                  Trash
                </Link>
                <Link to="/vaults/$vaultId/purged" params={{ vaultId }}>
                  Purged
                </Link>
              </div>
            </Card>
            <Card title="Upload Files">
              <UploadForm vaultId={vaultId} folder={currentFolder.fullPath} />
            </Card>
            <Card title="Files">
              {filesQuery.isLoading ? (
                <p>Loading...</p>
              ) : (
                <FileList
                  files={files}
                  folders={folders}
                  currentFolder={currentFolder.fullPath}
                  pendingFolderPaths={pendingFolderPaths}
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
                  onCreateFolder={(nextFolder) => {
                    setPendingFolderPaths((previous) =>
                      previous.includes(nextFolder) ? previous : [...previous, nextFolder]
                    );
                    void createFolder
                      .mutateAsync(nextFolder)
                      .catch(() => {
                        setPendingFolderPaths((previous) =>
                          previous.filter((path) => path !== nextFolder)
                        );
                      });
                  }}
                  onAction={(fullPath) => {
                    void moveToTrash.mutateAsync(fullPath);
                  }}
                />
              )}
            </Card>
          </>
        )}
      </Page>
    </RequireAuth>
  );
};
