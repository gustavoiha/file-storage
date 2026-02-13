import { Folder, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useFileIconForPath } from '@/hooks/useFileIconForPath';
import type { ActiveUploadFile } from '@/hooks/useDockspaceUploadDialog';

interface DockspaceSidebarProps {
  activeUploads: ActiveUploadFile[];
  uploadErrorMessage: string | null;
  onAddFolder: () => void;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
}

interface UploadQueueRowProps {
  upload: ActiveUploadFile;
}

const UploadQueueRow = ({ upload }: UploadQueueRowProps) => {
  const FileIcon = useFileIconForPath(upload.fullPath);

  return (
    <li className="dockspace-sidebar__upload-item">
      <span className="dockspace-sidebar__upload-item-main">
        <FileIcon className="dockspace-sidebar__upload-item-icon" size={15} strokeWidth={1.6} aria-hidden="true" />
        <span className="dockspace-sidebar__upload-item-path">{upload.fullPath}</span>
      </span>
      <span className="dockspace-sidebar__upload-item-status">
        {upload.status === 'pending' ? 'Waiting...' : `Uploading ${upload.progress}%`}
      </span>
    </li>
  );
};

export const DockspaceSidebar = ({
  activeUploads,
  uploadErrorMessage,
  onAddFolder,
  onUploadFiles,
  onUploadFolder
}: DockspaceSidebarProps) => (
  <aside className="dockspace-sidebar" aria-label="Dockspace sidebar">
    <div className="dockspace-sidebar__top-scroll">
      <section className="dockspace-sidebar__section">
        <h2 className="dockspace-sidebar__title">Actions</h2>
        <div className="dockspace-sidebar__actions">
          <Button type="button" variant="secondary" onClick={onUploadFiles}>
            <Upload size={14} aria-hidden="true" />
            Upload files
          </Button>
          <Button type="button" variant="secondary" onClick={onUploadFolder}>
            <Upload size={14} aria-hidden="true" />
            Upload folder
          </Button>
          <Button type="button" variant="secondary" onClick={onAddFolder}>
            <Folder size={14} aria-hidden="true" />
            Create folder
          </Button>
        </div>
      </section>
    </div>

    <section className="dockspace-sidebar__section dockspace-sidebar__section--uploads" aria-live="polite">
      <div className="dockspace-sidebar__uploads-header">
        <h2 className="dockspace-sidebar__title">Uploads</h2>
        <span className="dockspace-sidebar__uploads-count">{activeUploads.length}</span>
      </div>
      {activeUploads.length ? (
        <ul className="dockspace-sidebar__upload-list">
          {activeUploads.map((upload) => (
            <UploadQueueRow key={upload.id} upload={upload} />
          ))}
        </ul>
      ) : (
        <p className="dockspace-sidebar__uploads-empty">No active uploads.</p>
      )}
      {uploadErrorMessage ? <p className="dockspace-sidebar__uploads-error">{uploadErrorMessage}</p> : null}
    </section>
  </aside>
);
