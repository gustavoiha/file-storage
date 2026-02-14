import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Folder } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { useFileIconForPath } from '@/hooks/useFileIconForPath';
import type { FileRecord, FolderRecord } from '@/lib/apiTypes';

interface FileListProps {
  files: FileRecord[];
  folders?: FolderRecord[];
  currentFolder?: string;
  pendingFolderPaths?: string[];
  pendingFolderTrashPaths?: string[];
  pendingUploadFiles?: PendingUploadFileEntry[];
  pendingUploadFolderPaths?: string[];
  emptyState?: ReactNode;
  downloadActionLabel?: string | undefined;
  folderRenameActionLabel?: string | undefined;
  renameActionLabel?: string | undefined;
  rootBreadcrumbLabel?: string;
  selectedFilePaths?: string[];
  selectionActions?: ReactNode;
  statusMessage?: string | null;
  toolbarActions?: ReactNode;
  actionLabel: string;
  onDownload?: ((file: FileRecord) => void) | undefined;
  onRename?: ((fullPath: string) => void) | undefined;
  onRenameFolder?: ((folderPath: string) => void) | undefined;
  onOpenFile?: ((file: FileRecord) => void) | undefined;
  onOpenFolder?: (folderPath: string) => void;
  onToggleFileSelection?: ((fullPath: string) => void) | undefined;
  onActionFolder?: ((folderPath: string) => void) | undefined;
  onAction: (fullPath: string) => void;
}

interface FolderEntry {
  fullPath: string;
  name: string;
}

interface FolderListEntry extends FolderEntry {
  pendingState: 'none' | 'creating' | 'uploading' | 'trashing';
}

interface BreadcrumbItem {
  label: string;
  fullPath: string;
}

interface PendingUploadFileEntry {
  fullPath: string;
  progress: number;
  status: 'pending' | 'uploading';
}

const normalizeFolderPath = (folderPath: string): string => {
  const trimmed = folderPath.trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }

  const cleaned = trimmed.replace(/^\/+/, '').replace(/\/+$/, '');
  return `/${cleaned}`;
};

const fileNameFromPath = (fullPath: string): string => {
  const segments = fullPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? fullPath;
};

const parentFolderPath = (fullPath: string): string => {
  const segments = fullPath.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return '/';
  }

  return `/${segments.slice(0, -1).join('/')}`;
};

const folderName = (folderPath: string): string => {
  if (folderPath === '/') {
    return 'Root';
  }

  const segments = folderPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? folderPath;
};

const breadcrumbItems = (folderPath: string, rootLabel: string): BreadcrumbItem[] => {
  const normalized = normalizeFolderPath(folderPath);
  const segments = normalized.split('/').filter(Boolean);
  const items: BreadcrumbItem[] = [{ label: rootLabel, fullPath: '/' }];

  let runningPath = '';
  for (const segment of segments) {
    runningPath += `/${segment}`;
    items.push({
      label: segment,
      fullPath: runningPath
    });
  }

  return items;
};

interface FlatFileListProps {
  actionLabel: string;
  files: FileRecord[];
  onAction: (fullPath: string) => void;
}

const FlatFileList = ({ actionLabel, files, onAction }: FlatFileListProps) => {
  if (!files.length) {
    return <p>No files found.</p>;
  }

  return (
    <ul className="resource-list">
      {files.map((file) => (
        <li key={file.fullPath} className="resource-list__item resource-list__item--spaced">
          <div>
            <strong>{file.fullPath}</strong>
            {typeof file.size === 'number' ? <p>{file.size} bytes</p> : null}
          </div>
          <Button variant="secondary" onClick={() => onAction(file.fullPath)}>
            {actionLabel}
          </Button>
        </li>
      ))}
    </ul>
  );
};

interface FolderBreadcrumbsProps {
  crumbs: BreadcrumbItem[];
  currentFolder: string;
  onOpenFolder: (folderPath: string) => void;
}

const FolderBreadcrumbs = ({ crumbs, currentFolder, onOpenFolder }: FolderBreadcrumbsProps) => (
  <nav className="dockspace-browser__breadcrumbs" aria-label="Folder breadcrumb">
    {crumbs.map((crumb, index) => {
      const isCurrent = crumb.fullPath === currentFolder;

      return (
        <span key={crumb.fullPath} className="dockspace-browser__crumb-segment">
          <button
            type="button"
            className="dockspace-browser__crumb-button"
            disabled={isCurrent}
            onClick={() => onOpenFolder(crumb.fullPath)}
          >
            {crumb.label}
          </button>
          {index < crumbs.length - 1 ? <span className="dockspace-browser__crumb-divider">/</span> : null}
        </span>
      );
    })}
  </nav>
);

interface PendingFolderRowProps {
  name: string;
  statusLabel: string;
}

const PendingFolderRow = ({ name, statusLabel }: PendingFolderRowProps) => (
  <li className="resource-list__item dockspace-browser__folder-item dockspace-browser__folder-item--pending">
    <div className="dockspace-browser__folder-pending">
      <span className="dockspace-browser__item-main">
        <Folder className="dockspace-browser__folder-icon" size={16} strokeWidth={1.5} aria-hidden="true" />
        <span className="dockspace-browser__item-name">{name}</span>
      </span>
      <span className="dockspace-browser__item-meta">
        <span className="dockspace-browser__spinner" aria-hidden="true" />
        {statusLabel}
      </span>
    </div>
  </li>
);

interface PendingFileRowProps {
  filePath: string;
  progress: number;
  status: 'pending' | 'uploading';
}

const PendingFileRow = ({ filePath, progress, status }: PendingFileRowProps) => {
  const FileIcon = useFileIconForPath(filePath);
  const fileName = fileNameFromPath(filePath);

  return (
    <li className="resource-list__item dockspace-browser__file-item dockspace-browser__file-item--pending">
      <div className="dockspace-browser__file-row">
        <span className="dockspace-browser__file-open dockspace-browser__file-open--pending">
          <span className="dockspace-browser__file-summary">
            <span className="dockspace-browser__file-main">
              <FileIcon
                className="dockspace-browser__file-icon"
                size={16}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span className="dockspace-browser__file-name">{fileName}</span>
            </span>
            <span className="dockspace-browser__file-size">
              {status === 'uploading' ? `Uploading... ${progress}%` : 'Waiting to upload'}
            </span>
          </span>
        </span>
        <span className="dockspace-browser__item-meta">
          <span className="dockspace-browser__spinner" aria-hidden="true" />
        </span>
      </div>
    </li>
  );
};

interface FolderRowProps {
  actionLabel: string;
  folderEntry: FolderEntry;
  onAction?: ((folderPath: string) => void) | undefined;
  onRenameFolder?: ((folderPath: string) => void) | undefined;
  onOpenFolder: (folderPath: string) => void;
  selectionMode: boolean;
  renameActionLabel?: string | undefined;
}

const FolderRow = ({
  actionLabel,
  folderEntry,
  onAction,
  onOpenFolder,
  onRenameFolder,
  selectionMode,
  renameActionLabel
}: FolderRowProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const hasRenameAction = Boolean(onRenameFolder && renameActionLabel);
  const hasMenuActions = hasRenameAction || Boolean(onAction);
  const menuStyle: CSSProperties | undefined = menuAnchor
    ? {
        position: 'fixed',
        left: menuAnchor.x + 4,
        top: menuAnchor.y + 4,
        right: 'auto'
      }
    : undefined;

  return (
    <li
      className="resource-list__item dockspace-browser__folder-item"
      onContextMenu={(event) => {
        if (!hasMenuActions) {
          return;
        }

        event.preventDefault();
        setMenuAnchor({ x: event.clientX, y: event.clientY });
        setIsMenuOpen(true);
      }}
    >
      <div className="dockspace-browser__folder-row">
        <button
          type="button"
          className="dockspace-browser__folder-button"
          onClick={() => onOpenFolder(folderEntry.fullPath)}
        >
          <span className="dockspace-browser__item-main">
            {selectionMode ? (
              <input
                type="checkbox"
                className="dockspace-browser__row-checkbox dockspace-browser__row-checkbox--disabled"
                disabled
                tabIndex={-1}
                aria-hidden="true"
              />
            ) : (
              <Folder
                className="dockspace-browser__folder-icon"
                size={16}
                strokeWidth={1.5}
                aria-hidden="true"
              />
            )}
            <span className="dockspace-browser__item-name">{folderEntry.name}</span>
          </span>
        </button>
        {hasMenuActions ? (
          <DropdownMenu
            className="dockspace-browser__file-actions"
            isOpen={isMenuOpen}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) {
                setMenuAnchor(null);
              }

              setIsMenuOpen(nextOpen);
            }}
          >
            <DropdownMenu.Trigger
              className="dockspace-browser__file-actions-trigger"
              aria-label={`Actions for ${folderEntry.name}`}
              onClick={() => {
                setMenuAnchor(null);
              }}
            >
              ⋯
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              label={`Actions for ${folderEntry.name}`}
              className="dockspace-browser__file-actions-menu"
              style={menuStyle}
            >
              {hasRenameAction ? (
                <DropdownMenu.Button
                  className="dockspace-browser__file-actions-item"
                  onClick={() => onRenameFolder?.(folderEntry.fullPath)}
                >
                  {renameActionLabel}
                </DropdownMenu.Button>
              ) : null}
              {hasRenameAction && onAction ? <DropdownMenu.Separator /> : null}
              {onAction ? (
                <DropdownMenu.Button
                  className="dockspace-browser__file-actions-item"
                  onClick={() => onAction(folderEntry.fullPath)}
                >
                  {actionLabel}
                </DropdownMenu.Button>
              ) : null}
            </DropdownMenu.Content>
          </DropdownMenu>
        ) : null}
      </div>
    </li>
  );
};

interface FileRowProps {
  actionLabel: string;
  downloadActionLabel?: string | undefined;
  file: FileRecord;
  isSelected: boolean;
  selectionMode: boolean;
  onDownload?: ((file: FileRecord) => void) | undefined;
  onOpenFile?: ((file: FileRecord) => void) | undefined;
  onToggleSelection?: ((fullPath: string) => void) | undefined;
  onRename?: ((fullPath: string) => void) | undefined;
  onAction: (fullPath: string) => void;
  renameActionLabel?: string | undefined;
}

const FileRow = ({
  actionLabel,
  downloadActionLabel,
  file,
  isSelected,
  selectionMode,
  onDownload,
  onOpenFile,
  onToggleSelection,
  onAction,
  onRename,
  renameActionLabel
}: FileRowProps) => {
  const FileIcon = useFileIconForPath(file.fullPath);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const fileName = fileNameFromPath(file.fullPath);
  const menuStyle: CSSProperties | undefined = menuAnchor
    ? {
        position: 'fixed',
        left: menuAnchor.x + 4,
        top: menuAnchor.y + 4,
        right: 'auto'
      }
    : undefined;

  return (
    <li
      className="resource-list__item dockspace-browser__file-item"
      onContextMenu={(event) => {
        if (selectionMode) {
          event.preventDefault();
          return;
        }

        event.preventDefault();
        setMenuAnchor({ x: event.clientX, y: event.clientY });
        setIsMenuOpen(true);
      }}
    >
      <div className="dockspace-browser__file-row">
        <button
          type="button"
          className="dockspace-browser__file-open"
          onClick={() => {
            if (selectionMode && onToggleSelection) {
              onToggleSelection(file.fullPath);
              return;
            }

            onOpenFile?.(file);
          }}
        >
          <span className="dockspace-browser__file-summary">
            <span className="dockspace-browser__file-main">
              <span
                className="dockspace-browser__file-icon-slot"
                data-selected={isSelected ? 'true' : 'false'}
                data-selection-mode={selectionMode ? 'true' : 'false'}
              >
                <span className="dockspace-browser__file-icon-wrap">
                  <FileIcon
                    className="dockspace-browser__file-icon"
                    size={16}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
                {onToggleSelection ? (
                  <span className="dockspace-browser__file-checkbox-wrap">
                    <input
                      type="checkbox"
                      className="dockspace-browser__row-checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelection(file.fullPath)}
                      onClick={(event) => event.stopPropagation()}
                      aria-label={`Select ${fileName}`}
                    />
                  </span>
                ) : null}
              </span>
              <span className="dockspace-browser__file-name">{fileName}</span>
            </span>
            {typeof file.size === 'number' ? (
              <span className="dockspace-browser__file-size">{file.size} bytes</span>
            ) : null}
          </span>
        </button>
        {!selectionMode ? (
          <DropdownMenu
            className="dockspace-browser__file-actions"
            isOpen={isMenuOpen}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) {
                setMenuAnchor(null);
              }

              setIsMenuOpen(nextOpen);
            }}
          >
            <DropdownMenu.Trigger
              className="dockspace-browser__file-actions-trigger"
              aria-label={`Actions for ${fileName}`}
              onClick={() => {
                setMenuAnchor(null);
              }}
            >
              ⋯
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              label={`Actions for ${fileName}`}
              className="dockspace-browser__file-actions-menu"
              style={menuStyle}
            >
              {onRename && renameActionLabel ? (
                <DropdownMenu.Button
                  className="dockspace-browser__file-actions-item"
                  onClick={() => onRename(file.fullPath)}
                >
                  {renameActionLabel}
                </DropdownMenu.Button>
              ) : null}
              {onDownload && downloadActionLabel ? (
                <DropdownMenu.Button
                  className="dockspace-browser__file-actions-item"
                  onClick={() => onDownload(file)}
                >
                  {downloadActionLabel}
                </DropdownMenu.Button>
              ) : null}
              {onRename && renameActionLabel ? <DropdownMenu.Separator /> : null}
              {onDownload && downloadActionLabel && !(onRename && renameActionLabel) ? (
                <DropdownMenu.Separator />
              ) : null}
              <DropdownMenu.Button
                className="dockspace-browser__file-actions-item"
                onClick={() => onAction(file.fullPath)}
              >
                {actionLabel}
              </DropdownMenu.Button>
            </DropdownMenu.Content>
          </DropdownMenu>
        ) : null}
      </div>
    </li>
  );
};

interface FolderModeListProps {
  actionLabel: string;
  currentFolder: string;
  downloadActionLabel?: string | undefined;
  emptyState?: ReactNode;
  files: FileRecord[];
  folderRenameActionLabel?: string | undefined;
  folders: FolderRecord[];
  onDownload?: ((file: FileRecord) => void) | undefined;
  onOpenFile?: ((file: FileRecord) => void) | undefined;
  onRename?: ((fullPath: string) => void) | undefined;
  onRenameFolder?: ((folderPath: string) => void) | undefined;
  onAction: (fullPath: string) => void;
  onActionFolder?: ((folderPath: string) => void) | undefined;
  onOpenFolder: (folderPath: string) => void;
  pendingFolderPaths: string[];
  pendingFolderTrashPaths: string[];
  pendingUploadFiles: PendingUploadFileEntry[];
  pendingUploadFolderPaths: string[];
  renameActionLabel?: string | undefined;
  rootBreadcrumbLabel: string;
  selectedFilePaths: string[];
  selectionActions?: ReactNode;
  statusMessage?: string | null;
  toolbarActions?: ReactNode;
  onToggleFileSelection?: ((fullPath: string) => void) | undefined;
}

const FolderModeList = ({
  actionLabel,
  currentFolder,
  downloadActionLabel,
  emptyState,
  files,
  folderRenameActionLabel,
  folders,
  onDownload,
  onOpenFile,
  onRename,
  onRenameFolder,
  onAction,
  onActionFolder,
  onOpenFolder,
  pendingFolderPaths,
  pendingFolderTrashPaths,
  pendingUploadFiles,
  pendingUploadFolderPaths,
  renameActionLabel,
  rootBreadcrumbLabel,
  selectedFilePaths,
  selectionActions,
  statusMessage,
  onToggleFileSelection,
  toolbarActions
}: FolderModeListProps) => {
  const normalizedCurrentFolder = normalizeFolderPath(currentFolder);
  const selectedFilePathSet = useMemo(() => new Set(selectedFilePaths), [selectedFilePaths]);
  const selectionMode = selectedFilePaths.length > 0;

  const directFiles = useMemo(
    () =>
      files
        .slice()
        .sort((left, right) =>
          fileNameFromPath(left.fullPath).localeCompare(fileNameFromPath(right.fullPath))
        ),
    [files]
  );

  const folderEntries = useMemo(() => {
    const nextFolders = new Map<string, FolderListEntry>();

    for (const folder of folders) {
      nextFolders.set(folder.fullPath, {
        fullPath: folder.fullPath,
        name: folder.name,
        pendingState: 'none'
      });
    }

    for (const pendingPath of pendingFolderPaths) {
      if (parentFolderPath(pendingPath) !== normalizedCurrentFolder) {
        continue;
      }

      if (!nextFolders.has(pendingPath)) {
        nextFolders.set(pendingPath, {
          fullPath: pendingPath,
          name: folderName(pendingPath),
          pendingState: 'creating'
        });
      }
    }

    for (const pendingPath of pendingUploadFolderPaths) {
      if (parentFolderPath(pendingPath) !== normalizedCurrentFolder) {
        continue;
      }

      if (!nextFolders.has(pendingPath)) {
        nextFolders.set(pendingPath, {
          fullPath: pendingPath,
          name: folderName(pendingPath),
          pendingState: 'uploading'
        });
      }
    }

    for (const pendingPath of pendingFolderTrashPaths) {
      if (parentFolderPath(pendingPath) !== normalizedCurrentFolder) {
        continue;
      }

      nextFolders.set(pendingPath, {
        fullPath: pendingPath,
        name: folderName(pendingPath),
        pendingState: 'trashing'
      });
    }

    return Array.from(nextFolders.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [
    folders,
    normalizedCurrentFolder,
    pendingFolderPaths,
    pendingFolderTrashPaths,
    pendingUploadFolderPaths
  ]);

  const pendingFileEntries = useMemo(
    () => {
      const existingFilePaths = new Set(directFiles.map((file) => file.fullPath));

      return pendingUploadFiles
        .filter((item) => parentFolderPath(item.fullPath) === normalizedCurrentFolder)
        .filter((item) => !existingFilePaths.has(item.fullPath))
        .slice()
        .sort((left, right) => fileNameFromPath(left.fullPath).localeCompare(fileNameFromPath(right.fullPath)));
    },
    [directFiles, normalizedCurrentFolder, pendingUploadFiles]
  );

  const crumbs = useMemo(
    () => breadcrumbItems(normalizedCurrentFolder, rootBreadcrumbLabel),
    [normalizedCurrentFolder, rootBreadcrumbLabel]
  );

  const hasEntries = folderEntries.length > 0 || directFiles.length > 0 || pendingFileEntries.length > 0;

  return (
    <div className="dockspace-browser">
      <div className="dockspace-browser__toolbar">
        <FolderBreadcrumbs
          crumbs={crumbs}
          currentFolder={normalizedCurrentFolder}
          onOpenFolder={onOpenFolder}
        />
        {toolbarActions ? (
          <div className="dockspace-browser__toolbar-actions">{toolbarActions}</div>
        ) : null}
      </div>
      {statusMessage ? (
        <p className="dockspace-browser__selection-feedback" role="status">
          {statusMessage}
        </p>
      ) : null}
      {selectionActions ? <div className="dockspace-browser__selection-bar">{selectionActions}</div> : null}

      <ul className="resource-list dockspace-browser__list">
        {!hasEntries ? (
          <li className="resource-list__item dockspace-browser__empty-item">
            {emptyState ?? <p>No files or folders in this location.</p>}
          </li>
        ) : null}

        {folderEntries.map((folderEntry) =>
          folderEntry.pendingState !== 'none' ? (
            <PendingFolderRow
              key={folderEntry.fullPath}
              name={folderEntry.name}
              statusLabel={
                folderEntry.pendingState === 'creating'
                  ? 'Creating...'
                  : folderEntry.pendingState === 'trashing'
                    ? 'Trashing...'
                    : 'Uploading...'
              }
            />
          ) : (
            <FolderRow
              key={folderEntry.fullPath}
              actionLabel={actionLabel}
              folderEntry={folderEntry}
              onAction={onActionFolder}
              onRenameFolder={onRenameFolder}
              onOpenFolder={onOpenFolder}
              selectionMode={selectionMode}
              renameActionLabel={folderRenameActionLabel}
            />
          )
        )}

        {pendingFileEntries.map((pendingFile) => (
          <PendingFileRow
            key={pendingFile.fullPath}
            filePath={pendingFile.fullPath}
            progress={pendingFile.progress}
            status={pendingFile.status}
          />
        ))}

        {directFiles.map((file) => (
          <FileRow
            key={file.fullPath}
            actionLabel={actionLabel}
            downloadActionLabel={downloadActionLabel}
            file={file}
            isSelected={selectedFilePathSet.has(file.fullPath)}
            selectionMode={selectionMode}
            onDownload={onDownload}
            onOpenFile={onOpenFile}
            onToggleSelection={onToggleFileSelection}
            onRename={onRename}
            onAction={onAction}
            renameActionLabel={renameActionLabel}
          />
        ))}
      </ul>
    </div>
  );
};

export const FileList = ({
  actionLabel,
  currentFolder = '/',
  downloadActionLabel,
  emptyState,
  files,
  folderRenameActionLabel,
  folders = [],
  onDownload,
  onOpenFile,
  onRename,
  onRenameFolder,
  onAction,
  onActionFolder,
  onOpenFolder,
  onToggleFileSelection,
  pendingFolderPaths = [],
  pendingFolderTrashPaths = [],
  pendingUploadFiles = [],
  pendingUploadFolderPaths = [],
  renameActionLabel,
  rootBreadcrumbLabel = 'Root',
  selectedFilePaths = [],
  selectionActions,
  statusMessage,
  toolbarActions
}: FileListProps) => {
  if (!onOpenFolder) {
    return <FlatFileList actionLabel={actionLabel} files={files} onAction={onAction} />;
  }

  return (
    <FolderModeList
      actionLabel={actionLabel}
      currentFolder={currentFolder}
      downloadActionLabel={downloadActionLabel}
      emptyState={emptyState}
      files={files}
      folderRenameActionLabel={folderRenameActionLabel}
      folders={folders}
      onDownload={onDownload}
      onOpenFile={onOpenFile}
      onRename={onRename}
      onRenameFolder={onRenameFolder}
      onAction={onAction}
      onActionFolder={onActionFolder}
      onOpenFolder={onOpenFolder}
      pendingFolderPaths={pendingFolderPaths}
      pendingFolderTrashPaths={pendingFolderTrashPaths}
      pendingUploadFiles={pendingUploadFiles}
      pendingUploadFolderPaths={pendingUploadFolderPaths}
      renameActionLabel={renameActionLabel}
      rootBreadcrumbLabel={rootBreadcrumbLabel}
      selectedFilePaths={selectedFilePaths}
      selectionActions={selectionActions}
      statusMessage={statusMessage ?? null}
      onToggleFileSelection={onToggleFileSelection}
      toolbarActions={toolbarActions}
    />
  );
};
