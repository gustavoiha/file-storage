import type { RefObject } from 'react';
import { AlertCircle, ArrowLeft, File, Folder, FolderOpen, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useFiles } from '@/hooks/useFiles';
import { formatFileSize, formatModifiedDate, pluralize } from '@/lib/fileFormat';

export interface FolderInfoTarget {
  folderNodeId: string;
  /** Display name: the folder name, or the dockspace name for the root. */
  name: string;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
}

interface FolderInfoPanelProps {
  dockspaceId: string;
  folder: FolderInfoTarget;
  /** Path of the folder's parent, e.g. "Personal Drive / Travel"; null for the root. */
  locationLabel: string | null;
  /** `side` is the desktop column; `page` is the full-width phone view with a back button. */
  variant: 'side' | 'page';
  backLabel?: string | undefined;
  /** Opens the folder. Omitted for the folder that is already open. */
  onOpen?: (() => void) | undefined;
  onClose: () => void;
  /** Receives the button that takes focus when the panel opens: Close (side) or back (page). */
  focusTargetRef?: RefObject<HTMLButtonElement> | undefined;
}

interface FolderContentsSummary {
  folderCount: number;
  fileCount: number;
  /** Sum of the sizes of the direct files; null when no file has a known size. */
  filesSize: number | null;
}

export const summarizeFolderContents = (
  items: ReadonlyArray<{ childType: 'file' | 'folder'; size?: number | undefined }>
): FolderContentsSummary => {
  let folderCount = 0;
  let fileCount = 0;
  let filesSize: number | null = null;

  for (const item of items) {
    if (item.childType === 'folder') {
      folderCount += 1;
      continue;
    }

    fileCount += 1;
    if (typeof item.size === 'number') {
      filesSize = (filesSize ?? 0) + item.size;
    }
  }

  return { folderCount, fileCount, filesSize };
};

const CountTile = ({ kind, count }: { kind: 'folder' | 'file'; count: number | null }) => {
  const Icon = kind === 'folder' ? Folder : File;
  const caption = count === 1 ? kind : `${kind}s`;

  return (
    <li className="dockspace-folder-info__stat">
      <Icon className="dockspace-folder-info__stat-icon" size={18} strokeWidth={1.5} aria-hidden="true" />
      <span className="dockspace-folder-info__stat-number" aria-hidden="true">
        {count === null ? <span className="dockspace-folder-info__skeleton" /> : count}
      </span>
      {/* Screen readers get the whole phrase ("1 file", "2 folders") once the count is known. */}
      <span className="dockspace-folder-info__stat-caption" aria-hidden={count === null ? undefined : 'true'}>
        {caption}
      </span>
      {count === null ? null : <span className="visually-hidden">{pluralize(count, kind)}</span>}
    </li>
  );
};

export const FolderInfoPanel = ({
  dockspaceId,
  folder,
  locationLabel,
  variant,
  backLabel,
  onOpen,
  onClose,
  focusTargetRef
}: FolderInfoPanelProps) => {
  // Same query key as the folder listing, so a folder that was already listed shows its counts at once.
  const contentsQuery = useFiles(dockspaceId, folder.folderNodeId);
  const items = contentsQuery.data?.items;
  const summary = items ? summarizeFolderContents(items) : null;
  const isLoading = !summary && (contentsQuery.isPending || contentsQuery.isFetching);
  const hasError = !summary && !isLoading && Boolean(contentsQuery.error);

  const TitleTag = variant === 'page' ? 'h1' : 'h2';
  const created = formatModifiedDate(folder.createdAt);
  const modified = formatModifiedDate(folder.updatedAt);
  const filesSize = summary && summary.fileCount > 0 ? formatFileSize(summary.filesSize) : null;

  return (
    <aside
      className={`dockspace-preview dockspace-preview--${variant} dockspace-folder-info`}
      aria-label={`Info for ${folder.name}`}
    >
      <header className="dockspace-preview__head">
        {variant === 'page' ? (
          <button
            ref={focusTargetRef}
            type="button"
            className="dockspace-icon-button dockspace-icon-button--ghost"
            aria-label={backLabel ?? 'Back'}
            onClick={onClose}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
        ) : null}
        <Folder className="dockspace-preview__icon" size={16} strokeWidth={1.5} aria-hidden="true" />
        {/* The page variant replaces the phone listing and its h1, so the folder name becomes the page's h1. */}
        <TitleTag className="dockspace-preview__title" title={folder.name}>
          {folder.name}
        </TitleTag>
        {onOpen ? (
          <Button type="button" variant="secondary" size="sm" onClick={onOpen}>
            <FolderOpen size={14} aria-hidden="true" />
            Open
          </Button>
        ) : null}
        {variant === 'side' ? (
          <button
            ref={focusTargetRef}
            type="button"
            className="dockspace-icon-button dockspace-icon-button--ghost"
            aria-label="Close folder info"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        ) : null}
      </header>
      <div className="dockspace-preview__body">
        <p className="dockspace-folder-info__label">Folder info</p>
        {hasError ? (
          <div className="ui-alert ui-alert--error dockspace-folder-info__error" role="alert">
            <AlertCircle className="dockspace-folder-info__error-icon" size={16} aria-hidden="true" />
            <span>
              Couldn&apos;t count what {folder.name} contains.{' '}
              <button
                type="button"
                className="dockspace-link-button"
                onClick={() => {
                  void contentsQuery.refetch();
                }}
              >
                Try again
              </button>
            </span>
          </div>
        ) : (
          <ul className="dockspace-folder-info__stats" aria-label="Contents">
            <CountTile kind="folder" count={summary?.folderCount ?? null} />
            <CountTile kind="file" count={summary?.fileCount ?? null} />
          </ul>
        )}
        <dl className="dockspace-preview__meta">
          {isLoading ? (
            <>
              <dt>Files size</dt>
              <dd>
                <span className="dockspace-folder-info__skeleton dockspace-folder-info__skeleton--bar" />
                <span className="visually-hidden">Counting</span>
              </dd>
            </>
          ) : null}
          {filesSize ? (
            <>
              <dt>Files size</dt>
              <dd>
                {filesSize} <span className="dockspace-folder-info__muted">(files directly inside)</span>
              </dd>
            </>
          ) : null}
          {created ? (
            <>
              <dt>Created</dt>
              <dd>{created}</dd>
            </>
          ) : null}
          {modified ? (
            <>
              <dt>Modified</dt>
              <dd>{modified}</dd>
            </>
          ) : null}
          {locationLabel ? (
            <>
              <dt>Location</dt>
              <dd className="dockspace-folder-info__truncate" title={locationLabel}>
                {locationLabel}
              </dd>
            </>
          ) : null}
        </dl>
        {isLoading ? (
          <p className="dockspace-preview__hint dockspace-folder-info__status" role="status">
            <span className="dockspace-browser__spinner" aria-hidden="true" />
            Counting contents…
          </p>
        ) : null}
        {variant === 'side' && !isLoading && !hasError ? (
          <p className="dockspace-preview__hint">
            <kbd>Esc</kbd> closes the info
          </p>
        ) : null}
      </div>
    </aside>
  );
};
