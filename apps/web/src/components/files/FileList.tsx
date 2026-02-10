import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import type { FileRecord, FolderRecord } from '@/lib/apiTypes';
import { buildPathInFolder, isValidFileName } from './pathHelpers';

interface FileListProps {
  files: FileRecord[];
  folders?: FolderRecord[];
  currentFolder?: string;
  pendingFolderPaths?: string[];
  actionLabel: string;
  onOpenFolder?: (folderPath: string) => void;
  onCreateFolder?: (folderPath: string) => void;
  onAction: (fullPath: string) => void;
}

interface FolderEntry {
  fullPath: string;
  name: string;
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

const breadcrumbItems = (folderPath: string): Array<{ label: string; fullPath: string }> => {
  const normalized = normalizeFolderPath(folderPath);
  const segments = normalized.split('/').filter(Boolean);
  const items: Array<{ label: string; fullPath: string }> = [{ label: 'Root', fullPath: '/' }];

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

export const FileList = ({
  files,
  folders = [],
  currentFolder = '/',
  pendingFolderPaths = [],
  actionLabel,
  onOpenFolder,
  onCreateFolder,
  onAction
}: FileListProps) => {
  if (!onOpenFolder || !onCreateFolder) {
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
  }

  return (
    <FolderModeList
      files={files}
      folders={folders}
      currentFolder={currentFolder}
      pendingFolderPaths={pendingFolderPaths}
      actionLabel={actionLabel}
      onOpenFolder={onOpenFolder}
      onCreateFolder={onCreateFolder}
      onAction={onAction}
    />
  );
};

interface FolderModeListProps {
  files: FileRecord[];
  folders: FolderRecord[];
  currentFolder: string;
  pendingFolderPaths: string[];
  actionLabel: string;
  onOpenFolder: (folderPath: string) => void;
  onCreateFolder: (folderPath: string) => void;
  onAction: (fullPath: string) => void;
}

const FolderModeList = ({
  files,
  folders,
  currentFolder,
  pendingFolderPaths,
  actionLabel,
  onOpenFolder,
  onCreateFolder,
  onAction
}: FolderModeListProps) => {
  const normalizedCurrentFolder = normalizeFolderPath(currentFolder);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);
  const [isAddingFolder, setIsAddingFolder] = useState(false);

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
    const nextFolders = new Map<string, { entry: FolderEntry; isPending: boolean }>();

    for (const folder of folders) {
      nextFolders.set(folder.fullPath, {
        entry: { fullPath: folder.fullPath, name: folder.name },
        isPending: false
      });
    }

    for (const pendingPath of pendingFolderPaths) {
      if (parentFolderPath(pendingPath) !== normalizedCurrentFolder) {
        continue;
      }

      if (!nextFolders.has(pendingPath)) {
        nextFolders.set(pendingPath, {
          entry: {
            fullPath: pendingPath,
            name: folderName(pendingPath)
          },
          isPending: true
        });
      }
    }

    return Array.from(nextFolders.values())
      .sort((left, right) => left.entry.name.localeCompare(right.entry.name))
      .map((value) => ({
        ...value.entry,
        isPending: value.isPending
      }));
  }, [folders, pendingFolderPaths, normalizedCurrentFolder]);

  const crumbs = breadcrumbItems(normalizedCurrentFolder);

  const onSubmitFolder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = folderNameInput.trim();

    if (!isValidFileName(trimmedName)) {
      setFolderError('Folder name cannot be empty and cannot include slashes.');
      return;
    }

    const nextFolderPath = buildPathInFolder(normalizedCurrentFolder, trimmedName);
    onCreateFolder(nextFolderPath);
    setFolderError(null);
    setFolderNameInput('');
    setIsAddingFolder(false);
  };

  const hasEntries = folderEntries.length > 0 || directFiles.length > 0;

  return (
    <div className="vault-browser">
      <nav className="vault-browser__breadcrumbs" aria-label="Folder breadcrumb">
        {crumbs.map((crumb, index) => {
          const isCurrent = crumb.fullPath === normalizedCurrentFolder;

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
              {index < crumbs.length - 1 ? (
                <span className="vault-browser__crumb-divider">/</span>
              ) : null}
            </span>
          );
        })}
      </nav>

      <ul className="resource-list vault-browser__list">
        {!hasEntries ? (
          <li className="resource-list__item">
            <p>No files or folders in this location.</p>
          </li>
        ) : null}

        {folderEntries.map((folderEntry) => {
          if (folderEntry.isPending) {
            return (
              <li
                key={folderEntry.fullPath}
                className="resource-list__item vault-browser__folder-item vault-browser__folder-item--pending"
              >
                <div className="vault-browser__folder-pending">
                  <span className="vault-browser__item-name">{folderEntry.name}</span>
                  <span className="vault-browser__item-meta">
                    <span className="vault-browser__spinner" aria-hidden="true" />
                    Creating...
                  </span>
                </div>
              </li>
            );
          }

          return (
            <li
              key={folderEntry.fullPath}
              className="resource-list__item vault-browser__folder-item"
            >
              <button
                type="button"
                className="vault-browser__folder-button"
                onClick={() => onOpenFolder(folderEntry.fullPath)}
              >
                <span className="vault-browser__item-name">{folderEntry.name}</span>
                <span className="vault-browser__item-meta">Folder</span>
              </button>
            </li>
          );
        })}

        {directFiles.map((file) => (
          <li key={file.fullPath} className="resource-list__item resource-list__item--spaced">
            <div>
              <strong>{fileNameFromPath(file.fullPath)}</strong>
              {typeof file.size === 'number' ? <p>{file.size} bytes</p> : null}
            </div>
            <Button variant="secondary" onClick={() => onAction(file.fullPath)}>
              {actionLabel}
            </Button>
          </li>
        ))}

        <li className="resource-list__item vault-browser__add-folder-row">
          {isAddingFolder ? (
            <form className="vault-browser__add-folder-form" onSubmit={onSubmitFolder}>
              <label className="ui-field" htmlFor="new-folder-name">
                <span className="ui-field__label">Folder name</span>
                <input
                  id="new-folder-name"
                  className="ui-input"
                  value={folderNameInput}
                  onChange={(event) => {
                    setFolderNameInput(event.target.value);
                    setFolderError(null);
                  }}
                  autoFocus
                />
              </label>
              {folderError ? <p className="vault-browser__error">{folderError}</p> : null}
              <div className="vault-browser__add-folder-actions">
                <Button type="submit">Create</Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsAddingFolder(false);
                    setFolderError(null);
                    setFolderNameInput('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="vault-browser__add-folder-button"
              onClick={() => setIsAddingFolder(true)}
            >
              + Add folder
            </button>
          )}
        </li>
      </ul>
    </div>
  );
};
