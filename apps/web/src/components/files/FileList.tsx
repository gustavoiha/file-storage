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
  folderRenameActionLabel?: string | undefined;
  renameActionLabel?: string | undefined;
  rootBreadcrumbLabel?: string;
  toolbarActions?: ReactNode;
  actionLabel: string;
  onRename?: ((fullPath: string) => void) | undefined;
  onRenameFolder?: ((folderPath: string) => void) | undefined;
  onOpenFolder?: (folderPath: string) => void;
  onAction: (fullPath: string) => void;
}

interface FolderEntry {
  fullPath: string;
  name: string;
}

interface FolderListEntry extends FolderEntry {
  isPending: boolean;
}

interface BreadcrumbItem {
  label: string;
  fullPath: string;
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
  <nav className="vault-browser__breadcrumbs" aria-label="Folder breadcrumb">
    {crumbs.map((crumb, index) => {
      const isCurrent = crumb.fullPath === currentFolder;

      return (
        <span key={crumb.fullPath} className="vault-browser__crumb-segment">
          <button
            type="button"
            className="vault-browser__crumb-button"
            disabled={isCurrent}
            onClick={() => onOpenFolder(crumb.fullPath)}
          >
            {crumb.label}
          </button>
          {index < crumbs.length - 1 ? <span className="vault-browser__crumb-divider">/</span> : null}
        </span>
      );
    })}
  </nav>
);

interface PendingFolderRowProps {
  name: string;
}

const PendingFolderRow = ({ name }: PendingFolderRowProps) => (
  <li className="resource-list__item vault-browser__folder-item vault-browser__folder-item--pending">
    <div className="vault-browser__folder-pending">
      <span className="vault-browser__item-main">
        <Folder className="vault-browser__folder-icon" size={16} strokeWidth={1.5} aria-hidden="true" />
        <span className="vault-browser__item-name">{name}</span>
      </span>
      <span className="vault-browser__item-meta">
        <span className="vault-browser__spinner" aria-hidden="true" />
        Creating...
      </span>
    </div>
  </li>
);

interface FolderRowProps {
  folderEntry: FolderEntry;
  onRenameFolder?: ((folderPath: string) => void) | undefined;
  onOpenFolder: (folderPath: string) => void;
  renameActionLabel?: string | undefined;
}

const FolderRow = ({ folderEntry, onOpenFolder, onRenameFolder, renameActionLabel }: FolderRowProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
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
      className="resource-list__item vault-browser__folder-item"
      onContextMenu={(event) => {
        if (!onRenameFolder || !renameActionLabel) {
          return;
        }

        event.preventDefault();
        setMenuAnchor({ x: event.clientX, y: event.clientY });
        setIsMenuOpen(true);
      }}
    >
      <div className="vault-browser__folder-row">
        <button
          type="button"
          className="vault-browser__folder-button"
          onClick={() => onOpenFolder(folderEntry.fullPath)}
        >
          <span className="vault-browser__item-main">
            <Folder
              className="vault-browser__folder-icon"
              size={16}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="vault-browser__item-name">{folderEntry.name}</span>
          </span>
        </button>
        {onRenameFolder && renameActionLabel ? (
          <DropdownMenu
            className="vault-browser__file-actions"
            isOpen={isMenuOpen}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) {
                setMenuAnchor(null);
              }

              setIsMenuOpen(nextOpen);
            }}
          >
            <DropdownMenu.Trigger
              className="vault-browser__file-actions-trigger"
              aria-label={`Actions for ${folderEntry.name}`}
              onClick={() => {
                setMenuAnchor(null);
              }}
            >
              ⋯
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              label={`Actions for ${folderEntry.name}`}
              className="vault-browser__file-actions-menu"
              style={menuStyle}
            >
              <DropdownMenu.Button
                className="vault-browser__file-actions-item"
                onClick={() => onRenameFolder(folderEntry.fullPath)}
              >
                {renameActionLabel}
              </DropdownMenu.Button>
            </DropdownMenu.Content>
          </DropdownMenu>
        ) : null}
      </div>
    </li>
  );
};

interface FileRowProps {
  actionLabel: string;
  file: FileRecord;
  onRename?: ((fullPath: string) => void) | undefined;
  onAction: (fullPath: string) => void;
  renameActionLabel?: string | undefined;
}

const FileRow = ({ actionLabel, file, onAction, onRename, renameActionLabel }: FileRowProps) => {
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
      className="resource-list__item vault-browser__file-item"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuAnchor({ x: event.clientX, y: event.clientY });
        setIsMenuOpen(true);
      }}
    >
      <div className="vault-browser__file-row">
        <span className="vault-browser__file-summary">
          <span className="vault-browser__file-main">
            <FileIcon
              className="vault-browser__file-icon"
              size={16}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="vault-browser__file-name">{fileName}</span>
          </span>
          {typeof file.size === 'number' ? (
            <span className="vault-browser__file-size">{file.size} bytes</span>
          ) : null}
        </span>
        <DropdownMenu
          className="vault-browser__file-actions"
          isOpen={isMenuOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setMenuAnchor(null);
            }

            setIsMenuOpen(nextOpen);
          }}
        >
          <DropdownMenu.Trigger
            className="vault-browser__file-actions-trigger"
            aria-label={`Actions for ${fileName}`}
            onClick={() => {
              setMenuAnchor(null);
            }}
          >
            ⋯
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            label={`Actions for ${fileName}`}
            className="vault-browser__file-actions-menu"
            style={menuStyle}
          >
            {onRename && renameActionLabel ? (
              <DropdownMenu.Button
                className="vault-browser__file-actions-item"
                onClick={() => onRename(file.fullPath)}
              >
                {renameActionLabel}
              </DropdownMenu.Button>
            ) : null}
            {onRename && renameActionLabel ? <DropdownMenu.Separator /> : null}
            <DropdownMenu.Button
              className="vault-browser__file-actions-item"
              onClick={() => onAction(file.fullPath)}
            >
              {actionLabel}
            </DropdownMenu.Button>
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>
    </li>
  );
};

interface FolderModeListProps {
  actionLabel: string;
  currentFolder: string;
  files: FileRecord[];
  folderRenameActionLabel?: string | undefined;
  folders: FolderRecord[];
  onRename?: ((fullPath: string) => void) | undefined;
  onRenameFolder?: ((folderPath: string) => void) | undefined;
  onAction: (fullPath: string) => void;
  onOpenFolder: (folderPath: string) => void;
  pendingFolderPaths: string[];
  renameActionLabel?: string | undefined;
  rootBreadcrumbLabel: string;
  toolbarActions?: ReactNode;
}

const FolderModeList = ({
  actionLabel,
  currentFolder,
  files,
  folderRenameActionLabel,
  folders,
  onRename,
  onRenameFolder,
  onAction,
  onOpenFolder,
  pendingFolderPaths,
  renameActionLabel,
  rootBreadcrumbLabel,
  toolbarActions
}: FolderModeListProps) => {
  const normalizedCurrentFolder = normalizeFolderPath(currentFolder);

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
        isPending: false
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
          isPending: true
        });
      }
    }

    return Array.from(nextFolders.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [folders, normalizedCurrentFolder, pendingFolderPaths]);

  const crumbs = useMemo(
    () => breadcrumbItems(normalizedCurrentFolder, rootBreadcrumbLabel),
    [normalizedCurrentFolder, rootBreadcrumbLabel]
  );

  const hasEntries = folderEntries.length > 0 || directFiles.length > 0;

  return (
    <div className="vault-browser">
      <div className="vault-browser__toolbar">
        <FolderBreadcrumbs
          crumbs={crumbs}
          currentFolder={normalizedCurrentFolder}
          onOpenFolder={onOpenFolder}
        />
        {toolbarActions ? (
          <div className="vault-browser__toolbar-actions">{toolbarActions}</div>
        ) : null}
      </div>

      <ul className="resource-list vault-browser__list">
        {!hasEntries ? (
          <li className="resource-list__item">
            <p>No files or folders in this location.</p>
          </li>
        ) : null}

        {folderEntries.map((folderEntry) =>
          folderEntry.isPending ? (
            <PendingFolderRow key={folderEntry.fullPath} name={folderEntry.name} />
          ) : (
            <FolderRow
              key={folderEntry.fullPath}
              folderEntry={folderEntry}
              onRenameFolder={onRenameFolder}
              onOpenFolder={onOpenFolder}
              renameActionLabel={folderRenameActionLabel}
            />
          )
        )}

        {directFiles.map((file) => (
          <FileRow
            key={file.fullPath}
            actionLabel={actionLabel}
            file={file}
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
  files,
  folderRenameActionLabel,
  folders = [],
  onRename,
  onRenameFolder,
  onAction,
  onOpenFolder,
  pendingFolderPaths = [],
  renameActionLabel,
  rootBreadcrumbLabel = 'Root',
  toolbarActions
}: FileListProps) => {
  if (!onOpenFolder) {
    return <FlatFileList actionLabel={actionLabel} files={files} onAction={onAction} />;
  }

  return (
    <FolderModeList
      actionLabel={actionLabel}
      currentFolder={currentFolder}
      files={files}
      folderRenameActionLabel={folderRenameActionLabel}
      folders={folders}
      onRename={onRename}
      onRenameFolder={onRenameFolder}
      onAction={onAction}
      onOpenFolder={onOpenFolder}
      pendingFolderPaths={pendingFolderPaths}
      renameActionLabel={renameActionLabel}
      rootBreadcrumbLabel={rootBreadcrumbLabel}
      toolbarActions={toolbarActions}
    />
  );
};
