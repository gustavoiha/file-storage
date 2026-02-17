import type { CSSProperties } from 'react';
import { ChevronRight, Folder, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useFileIconForPath } from '@/hooks/useFileIconForPath';
import type { ActiveUploadFile, SkippedUploadFile } from '@/hooks/useDockspaceUploadDialog';

interface DockspaceSidebarProps {
  folderTree: SidebarFolderTreeNode[];
  activeUploads: ActiveUploadFile[];
  skippedUploads: SkippedUploadFile[];
  uploadErrorMessage: string | null;
  onAddFolder: () => void;
  onDismissSkippedUploads: () => void;
  onOpenFolder: (folderPath: string) => void;
  onRetryUpload: (uploadId: number) => void;
  onToggleFolder: (folderNodeId: string) => void;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
}

export interface SidebarFolderTreeNode {
  folderNodeId: string;
  name: string;
  fullPath: string;
  directFileCount: number | null;
  isCurrent: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  canExpand: boolean;
  children: SidebarFolderTreeNode[];
}

interface UploadQueueRowProps {
  upload: ActiveUploadFile;
  onRetryUpload: (uploadId: number) => void;
}

const UploadQueueRow = ({ upload, onRetryUpload }: UploadQueueRowProps) => {
  const FileIcon = useFileIconForPath(upload.fullPath);

  return (
    <li className="dockspace-sidebar__upload-item">
      <span className="dockspace-sidebar__upload-item-main">
        <FileIcon className="dockspace-sidebar__upload-item-icon" size={15} strokeWidth={1.6} aria-hidden="true" />
        <span className="dockspace-sidebar__upload-item-path">{upload.fullPath}</span>
      </span>
      <span className="dockspace-sidebar__upload-item-status">
        {upload.status === 'pending'
          ? 'Waiting...'
          : upload.status === 'uploading'
            ? `Uploading ${upload.progress}%`
            : upload.errorMessage ?? 'Upload failed.'}
      </span>
      {upload.status === 'failed' ? (
        <span className="dockspace-sidebar__upload-item-actions">
          <Button type="button" variant="secondary" onClick={() => onRetryUpload(upload.id)}>
            Retry
          </Button>
        </span>
      ) : null}
    </li>
  );
};

interface SidebarFolderNodeProps {
  node: SidebarFolderTreeNode;
  depth: number;
  onOpenFolder: (folderPath: string) => void;
  onToggleFolder: (folderNodeId: string) => void;
}

const SidebarFolderNode = ({ node, depth, onOpenFolder, onToggleFolder }: SidebarFolderNodeProps) => {
  const hasKnownChildren = node.children.length > 0;
  const showLoadingLeaf = node.isExpanded && node.isLoading && !hasKnownChildren;
  const itemStyle = { '--dockspace-tree-depth': depth } as CSSProperties;

  return (
    <li className="dockspace-sidebar__tree-item">
      <div className="dockspace-sidebar__tree-row" style={itemStyle}>
        <div className="dockspace-sidebar__tree-main" data-current={node.isCurrent ? 'true' : 'false'}>
          {node.canExpand ? (
            <button
              type="button"
              className="dockspace-sidebar__tree-toggle"
              aria-label={`${node.isExpanded ? 'Collapse' : 'Expand'} ${node.name}`}
              onClick={() => onToggleFolder(node.folderNodeId)}
            >
              {node.isLoading ? (
                <Loader2 className="dockspace-sidebar__tree-spinner" size={13} aria-hidden="true" />
              ) : (
                <ChevronRight
                  className="dockspace-sidebar__tree-chevron"
                  size={13}
                  aria-hidden="true"
                  data-expanded={node.isExpanded ? 'true' : 'false'}
                />
              )}
            </button>
          ) : (
            <span className="dockspace-sidebar__tree-toggle-spacer" aria-hidden="true" />
          )}
          <button
            type="button"
            className="dockspace-sidebar__tree-folder-button"
            onClick={() => onOpenFolder(node.fullPath)}
          >
            <Folder size={14} strokeWidth={1.5} aria-hidden="true" />
            <span className="dockspace-sidebar__tree-folder-name">{node.name}</span>
          </button>
        </div>
        <span className="dockspace-sidebar__tree-count" title="Direct files in folder">
          {node.directFileCount === null ? '...' : node.directFileCount}
        </span>
      </div>
      {showLoadingLeaf ? (
        <div className="dockspace-sidebar__tree-loading">Loading subfolders...</div>
      ) : null}
      {node.isExpanded && hasKnownChildren ? (
        <ul className="dockspace-sidebar__tree-list">
          {node.children.map((child) => (
            <SidebarFolderNode
              key={child.folderNodeId}
              node={child}
              depth={depth + 1}
              onOpenFolder={onOpenFolder}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
};

export const DockspaceSidebar = ({
  folderTree,
  activeUploads,
  skippedUploads,
  uploadErrorMessage,
  onAddFolder,
  onDismissSkippedUploads,
  onOpenFolder,
  onRetryUpload,
  onToggleFolder,
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
      <section className="dockspace-sidebar__section dockspace-sidebar__section--folders">
        <h2 className="dockspace-sidebar__title">Folders</h2>
        {folderTree.length ? (
          <ul className="dockspace-sidebar__tree-list" aria-label="Folder discovery tree">
            {folderTree.map((node) => (
              <SidebarFolderNode
                key={node.folderNodeId}
                node={node}
                depth={0}
                onOpenFolder={onOpenFolder}
                onToggleFolder={onToggleFolder}
              />
            ))}
          </ul>
        ) : (
          <p className="dockspace-sidebar__uploads-empty">No folders discovered.</p>
        )}
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
            <UploadQueueRow key={upload.id} upload={upload} onRetryUpload={onRetryUpload} />
          ))}
        </ul>
      ) : (
        <p className="dockspace-sidebar__uploads-empty">No active uploads.</p>
      )}
      {uploadErrorMessage ? <p className="dockspace-sidebar__uploads-error">{uploadErrorMessage}</p> : null}
      {skippedUploads.length ? (
        <div className="dockspace-sidebar__uploads-skipped-card">
          <p className="dockspace-sidebar__uploads-skipped-title">
            {skippedUploads.length} file{skippedUploads.length === 1 ? '' : 's'} skipped as duplicates.
          </p>
          <ul className="dockspace-sidebar__uploads-skipped-list">
            {skippedUploads.map((item) => (
              <li key={`${item.duplicateType}:${item.fullPath}`} className="dockspace-sidebar__uploads-skipped-item">
                <span className="dockspace-sidebar__uploads-skipped-path">{item.fullPath}</span>
              </li>
            ))}
          </ul>
          <Button type="button" variant="secondary" onClick={onDismissSkippedUploads}>
            Dismiss
          </Button>
        </div>
      ) : null}
    </section>
  </aside>
);
