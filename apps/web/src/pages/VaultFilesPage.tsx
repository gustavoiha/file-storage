import { Link, useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { FileList } from '@/components/files/FileList';
import { FolderPicker } from '@/components/files/FolderPicker';
import { UploadForm } from '@/components/files/UploadForm';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { useFiles, useMoveToTrash } from '@/hooks/useFiles';
import { useState } from 'react';

export const VaultFilesPage = () => {
  const { vaultId } = useParams({ from: '/vaults/$vaultId' });
  const [folder, setFolder] = useState('/');
  const filesQuery = useFiles(vaultId, folder);
  const moveToTrash = useMoveToTrash(vaultId, folder);

  return (
    <RequireAuth>
      <Page title={`Vault ${vaultId}`}>
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
        <Card title="Browse Folder">
          <FolderPicker folder={folder} onChange={setFolder} />
        </Card>
        <Card title="Upload File">
          <UploadForm vaultId={vaultId} folder={folder} />
        </Card>
        <Card title="Files">
          {filesQuery.isLoading ? (
            <p>Loading...</p>
          ) : (
            <FileList
              files={filesQuery.data ?? []}
              actionLabel="Move to Trash"
              onAction={(fullPath) => {
                void moveToTrash.mutateAsync(fullPath);
              }}
            />
          )}
        </Card>
      </Page>
    </RequireAuth>
  );
};
