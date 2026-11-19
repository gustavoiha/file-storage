import { useMemo, useState } from 'react';
import { ChevronRight, Folder, FolderOpen, Home } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { buildPathInFolder } from '@/components/files/pathHelpers';
import { useFileIconForPath } from '@/hooks/useFileIconForPath';
import { useFiles } from '@/hooks/useFiles';
import type { DirectoryChildRecord, FileRecord } from '@/lib/apiTypes';
import { formatFileSize } from '@/lib/fileFormat';

export interface FolderTrailEntry {
  folderNodeId: string;
  fullPath: string;
  name: string;
}

export interface FolderCrumb {
  key: string;
  label: string;
}

interface FolderBreadcrumbProps {
  crumbs: FolderCrumb[];
  /** `bar` renders the current folder as the last crumb; `compact` (phone) only lists ancestors. */
  variant?: 'bar' | 'compact';
  onSelectCrumb: (index: number) => void;
}

export const FolderBreadcrumb = ({ crumbs, variant = 'bar', onSelectCrumb }: FolderBreadcrumbProps) => {
  const visibleCrumbs = variant === 'compact' ? crumbs.slice(0, -1) : crumbs;

  return (
    <nav
      className={`dockspace-crumbs dockspace-crumbs--${variant}`}
      aria-label="Folder path"
    >
      {visibleCrumbs.map((crumb, index) => {
        const isCurrent = variant === 'bar' && index === crumbs.length - 1;
        const content = (
          <>
            {index === 0 ? (
              <Home className="dockspace-crumbs__home" size={variant === 'bar' ? 15 : 13} aria-hidden="true" />
            ) : null}
            {crumb.label}
          </>
        );

        return (
          <span key={crumb.key} className="dockspace-crumbs__segment">
            {isCurrent ? (
              <span className="dockspace-crumbs__crumb dockspace-crumbs__crumb--current" aria-current="page">
                {content}
              </span>
            ) : (
              <button
                type="button"
                className="dockspace-crumbs__crumb"
                onClick={() => onSelectCrumb(index)}
              >
                {content}
              </button>
            )}
            {variant === 'compact' || index < visibleCrumbs.length - 1 ? (
              <span className="dockspace-crumbs__divider" aria-hidden="true">
                /
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
};

interface ChildFolder {
  folderNodeId: string;
  name: string;
}

const sortByName = <T extends { name: string }>(items: T[]): T[] =>
  items.slice().sort((left, right) => left.name.localeCompare(right.name));

const splitChildren = (items: DirectoryChildRecord[] | undefined) => {
  const folders: ChildFolder[] = [];
  const files: DirectoryChildRecord[] = [];

  for (const item of items ?? []) {
    if (item.childType === 'folder') {
      folders.push({ folderNodeId: item.childId, name: item.name });
    } else {
      files.push(item);
    }
  }

  return { folders: sortByName(folders), files: sortByName(files) };
};

interface AncestorFileRowProps {
  file: FileRecord;
  name: string;
  onOpenFile: (file: FileRecord) => void;
}

const AncestorFileRow = ({ file, name, onOpenFile }: AncestorFileRowProps) => {
  const FileIcon = useFileIconForPath(file.fullPath);
  const size = formatFileSize(file.size);

  return (
    <li>
      <button
        type="button"
        className="dockspace-column__row dockspace-column__row--file"
        onClick={() => onOpenFile(file)}
      >
        <FileIcon className="dockspace-column__icon" size={16} strokeWidth={1.5} aria-hidden="true" />
        <span className="dockspace-column__name">{name}</span>
        {size ? <span className="dockspace-column__meta">{size}</span> : null}
      </button>
    </li>
  );
};

interface AncestorColumnProps {
  dockspaceId: string;
  entry: FolderTrailEntry;
  title: string;
  /** The folder that is next in the trail (open in the column to the right). */
  openChildFolderNodeId: string | null;
  /** Older ancestors are hidden at medium widths, where only the parent column is shown. */
  isOlderAncestor: boolean;
  onOpenFolder: (folder: ChildFolder) => void;
  onOpenFile: (file: FileRecord) => void;
}

export const AncestorColumn = ({
  dockspaceId,
  entry,
  title,
  openChildFolderNodeId,
  isOlderAncestor,
  onOpenFolder,
  onOpenFile
}: AncestorColumnProps) => {
  const query = useFiles(dockspaceId, entry.folderNodeId);
  const { folders, files } = useMemo(() => splitChildren(query.data?.items), [query.data?.items]);

  return (
    <section
      className={`dockspace-column dockspace-column--ancestor${
        isOlderAncestor ? ' dockspace-column--older' : ''
      }`}
      aria-label={title}
    >
      <header className="dockspace-column__head">
        <h2 className="dockspace-column__label">{title}</h2>
      </header>
      {query.isLoading ? <p className="dockspace-column__status">Loading…</p> : null}
      {query.error ? (
        <div className="dockspace-column__status">
          <Alert message={query.error instanceof Error ? query.error.message : 'Unable to load folder.'} />
        </div>
      ) : null}
      <ul className="dockspace-column__list">
        {folders.map((folder) => {
          const isOpen = folder.folderNodeId === openChildFolderNodeId;
          const Icon = isOpen ? FolderOpen : Folder;

          return (
            <li key={folder.folderNodeId}>
              <button
                type="button"
                className="dockspace-column__row dockspace-column__row--folder"
                aria-current={isOpen ? 'true' : undefined}
                onClick={() => onOpenFolder(folder)}
              >
                <Icon className="dockspace-column__icon" size={16} strokeWidth={1.5} aria-hidden="true" />
                <span className="dockspace-column__name">{folder.name}</span>
                <ChevronRight className="dockspace-column__chevron" size={14} aria-hidden="true" />
              </button>
            </li>
          );
        })}
        {files.map((item) => (
          <AncestorFileRow
            key={item.childId}
            name={item.name}
            file={{
              fileNodeId: item.childId,
              fullPath: buildPathInFolder(entry.fullPath, item.name),
              updatedAt: item.updatedAt
            }}
            onOpenFile={onOpenFile}
          />
        ))}
      </ul>
    </section>
  );
};

const MAX_COLLAPSED_CHIPS = 8;

interface ParentFolderChipsProps {
  dockspaceId: string;
  parentEntry: FolderTrailEntry;
  parentLabel: string;
  currentFolderNodeId: string;
  onOpenFolder: (folder: ChildFolder) => void;
}

export const ParentFolderChips = ({
  dockspaceId,
  parentEntry,
  parentLabel,
  currentFolderNodeId,
  onOpenFolder
}: ParentFolderChipsProps) => {
  const query = useFiles(dockspaceId, parentEntry.folderNodeId);
  const { folders } = useMemo(() => splitChildren(query.data?.items), [query.data?.items]);
  const [isExpanded, setIsExpanded] = useState(false);

  const visibleFolders = useMemo(() => {
    if (isExpanded || folders.length <= MAX_COLLAPSED_CHIPS) {
      return folders;
    }

    const firstSeven = folders.slice(0, MAX_COLLAPSED_CHIPS - 1);
    if (firstSeven.some((folder) => folder.folderNodeId === currentFolderNodeId)) {
      return firstSeven;
    }

    const current = folders.find((folder) => folder.folderNodeId === currentFolderNodeId);
    return current ? folders.slice(0, MAX_COLLAPSED_CHIPS - 2).concat(current) : firstSeven;
  }, [currentFolderNodeId, folders, isExpanded]);

  if (!folders.length) {
    return null;
  }

  return (
    <section className="dockspace-chips" aria-label={`In ${parentLabel}`}>
      <h2 className="dockspace-chips__label">In {parentLabel}</h2>
      <ul className="dockspace-chips__list">
        {visibleFolders.map((folder) => {
          const isCurrent = folder.folderNodeId === currentFolderNodeId;
          const Icon = isCurrent ? FolderOpen : Folder;

          return (
            <li key={folder.folderNodeId}>
              <button
                type="button"
                className="dockspace-chips__chip"
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => {
                  if (!isCurrent) {
                    onOpenFolder(folder);
                  }
                }}
              >
                <Icon size={14} strokeWidth={1.6} aria-hidden="true" />
                {folder.name}
              </button>
            </li>
          );
        })}
        {visibleFolders.length < folders.length ? (
          <li>
            <button
              type="button"
              className="dockspace-chips__chip dockspace-chips__chip--more"
              onClick={() => setIsExpanded(true)}
            >
              Show all ({folders.length})
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
};
