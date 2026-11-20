import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject
} from 'react';
import { ChevronRight, Folder } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { useFileIconForPath } from '@/hooks/useFileIconForPath';
import { useLongPress, type LongPressHandlers } from '@/hooks/useLongPress';
import type { FileRecord, FolderRecord } from '@/lib/apiTypes';
import { formatFileSize, formatModifiedDate, pluralize } from '@/lib/fileFormat';
import { positionMenuAtPoint, type MenuPoint } from '@/lib/menuPosition';

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
  folderDownloadActionLabel?: string | undefined;
  folderMoveActionLabel?: string | undefined;
  folderRenameActionLabel?: string | undefined;
  renameActionLabel?: string | undefined;
  /** Folder name shown in the column header ("{name} · N folders, M files"). */
  columnTitle?: string | undefined;
  /** Direct file counts per folder path, shown on folder rows when known. */
  folderFileCounts?: ReadonlyMap<string, number> | undefined;
  /** Full path of the file currently shown in the preview panel. */
  previewedFilePath?: string | null | undefined;
  selectedFilePaths?: string[];
  selectionActions?: ReactNode;
  /**
   * Overrides "selection mode = at least one file selected" (the phone layout keeps the mode on
   * with nothing selected after "Select items").
   */
  selectionMode?: boolean | undefined;
  /**
   * Phone layout: rows have no `⋯` button; press and hold (or the ContextMenu key / Shift+F10)
   * opens a row's menu, and folders cannot be opened while in selection mode.
   */
  isPhoneLayout?: boolean | undefined;
  statusMessage?: string | null;
  actionLabel: string;
  actionLabelWhilePending?: string | undefined;
  pendingActionPath?: string | null;
  secondaryActionLabel?: string | undefined;
  secondaryActionLabelWhilePending?: string | undefined;
  pendingSecondaryActionPath?: string | null;
  secondaryActionVariant?: 'primary' | 'secondary' | 'danger' | undefined;
  onDownload?: ((file: FileRecord) => void) | undefined;
  onDownloadFolder?: ((folderPath: string) => void) | undefined;
  onRename?: ((fullPath: string) => void) | undefined;
  onRenameFolder?: ((folderPath: string) => void) | undefined;
  onMoveFolder?: ((folderPath: string) => void) | undefined;
  onOpenFile?: ((file: FileRecord) => void) | undefined;
  onOpenFolder?: (folderPath: string) => void;
  onToggleFileSelection?: ((fullPath: string) => void) | undefined;
  onActionFolder?: ((folderPath: string) => void) | undefined;
  onSecondaryAction?: ((fullPath: string) => void) | undefined;
  onAction: (fullPath: string) => void;
}

interface FolderEntry {
  fullPath: string;
  name: string;
}

interface FolderListEntry extends FolderEntry {
  pendingState: 'none' | 'creating' | 'uploading' | 'trashing';
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

interface FlatFileListProps {
  actionLabel: string;
  actionLabelWhilePending?: string | undefined;
  files: FileRecord[];
  pendingActionPath?: string | null;
  pendingSecondaryActionPath?: string | null;
  secondaryActionLabel?: string | undefined;
  secondaryActionLabelWhilePending?: string | undefined;
  secondaryActionVariant?: 'primary' | 'secondary' | 'danger' | undefined;
  onSecondaryAction?: ((fullPath: string) => void) | undefined;
  onAction: (fullPath: string) => void;
}

const FlatFileList = ({
  actionLabel,
  actionLabelWhilePending,
  files,
  pendingActionPath,
  pendingSecondaryActionPath,
  secondaryActionLabel,
  secondaryActionLabelWhilePending,
  secondaryActionVariant = 'secondary',
  onSecondaryAction,
  onAction
}: FlatFileListProps) => {
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
          <div className="resource-list__item-actions">
            {onSecondaryAction && secondaryActionLabel ? (
              <Button
                variant={secondaryActionVariant}
                onClick={() => onSecondaryAction(file.fullPath)}
                disabled={pendingSecondaryActionPath === file.fullPath}
              >
                {pendingSecondaryActionPath === file.fullPath
                  ? (secondaryActionLabelWhilePending ?? secondaryActionLabel)
                  : secondaryActionLabel}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => onAction(file.fullPath)}
              disabled={pendingActionPath === file.fullPath}
            >
              {pendingActionPath === file.fullPath
                ? (actionLabelWhilePending ?? actionLabel)
                : actionLabel}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
};

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

interface UseRowMenuOptions {
  /** Phone layout: long-press and the ContextMenu key / Shift+F10 open the menu; the native menu is always suppressed. */
  isPhoneLayout: boolean;
  /** Whether the row currently has a menu to open (false in selection mode on phone, or with no actions). */
  canOpenMenu: boolean;
  /** Whether a right-click should be swallowed even when no menu opens (file rows in selection mode). */
  suppressNativeContextMenu: boolean;
}

interface RowMenu {
  isMenuOpen: boolean;
  menuStyle: CSSProperties | undefined;
  itemRef: RefObject<HTMLLIElement>;
  buttonRef: RefObject<HTMLButtonElement>;
  isPressed: boolean;
  longPressHandlers: LongPressHandlers | undefined;
  onOpenChange: (nextOpen: boolean) => void;
  onContextMenu: (event: MouseEvent<HTMLLIElement>) => void;
  onButtonKeyDown: ((event: KeyboardEvent<HTMLButtonElement>) => void) | undefined;
  clearAnchor: () => void;
}

/** Shared menu state for file and folder rows: anchor point, viewport clamping, long-press and keyboard opening. */
const useRowMenu = ({ isPhoneLayout, canOpenMenu, suppressNativeContextMenu }: UseRowMenuOptions): RowMenu => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<MenuPoint | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPoint | null>(null);
  const itemRef = useRef<HTMLLIElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openedFromRowRef = useRef(false);

  const openAt = useCallback((point: MenuPoint) => {
    openedFromRowRef.current = true;
    setMenuAnchor(point);
    setMenuPosition(null);
    setIsMenuOpen(true);
  }, []);

  const longPress = useLongPress({ enabled: isPhoneLayout && canOpenMenu, onLongPress: openAt });

  // Keep a menu opened at a point inside the viewport (8 px margin, flipped up near the bottom).
  useLayoutEffect(() => {
    if (!isMenuOpen || !menuAnchor) {
      return;
    }

    const menu = itemRef.current?.querySelector<HTMLElement>('[role="menu"]');
    if (!menu) {
      return;
    }

    const rect = menu.getBoundingClientRect();
    setMenuPosition(
      positionMenuAtPoint(
        menuAnchor,
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight }
      )
    );
  }, [isMenuOpen, menuAnchor]);

  // On phone, a menu opened from the row (press and hold, ContextMenu key) takes focus.
  useEffect(() => {
    if (!isMenuOpen || !isPhoneLayout || !openedFromRowRef.current) {
      return;
    }

    itemRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [isMenuOpen, isPhoneLayout]);

  useEffect(() => {
    if (!canOpenMenu && isMenuOpen) {
      setIsMenuOpen(false);
      setMenuAnchor(null);
      setMenuPosition(null);
    }
  }, [canOpenMenu, isMenuOpen]);

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setMenuAnchor(null);
        setMenuPosition(null);
        if (isPhoneLayout && openedFromRowRef.current) {
          // Return focus to the row when closing left it nowhere (Escape, tap outside),
          // but not when a menu action moved it on (e.g. into a dialog).
          setTimeout(() => {
            const active = document.activeElement;
            if (!active || active === document.body) {
              buttonRef.current?.focus();
            }
          }, 0);
        }

        openedFromRowRef.current = false;
      }

      setIsMenuOpen(nextOpen);
    },
    [isPhoneLayout]
  );

  const onContextMenu = useCallback(
    (event: MouseEvent<HTMLLIElement>) => {
      if (!canOpenMenu) {
        if (isPhoneLayout || suppressNativeContextMenu) {
          event.preventDefault();
        }

        return;
      }

      event.preventDefault();
      if (isPhoneLayout && (longPress.claim() || isMenuOpen)) {
        // The long-press (or the keyboard handler) already opened this menu.
        return;
      }

      openAt({ x: event.clientX, y: event.clientY });
    },
    [canOpenMenu, isMenuOpen, isPhoneLayout, longPress, openAt, suppressNativeContextMenu]
  );

  const onButtonKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!canOpenMenu || !(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) {
        return;
      }

      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openAt({ x: rect.left, y: rect.bottom });
    },
    [canOpenMenu, openAt]
  );

  const menuStyle: CSSProperties | undefined = menuAnchor
    ? {
        position: 'fixed',
        left: menuPosition?.x ?? menuAnchor.x + 4,
        top: menuPosition?.y ?? menuAnchor.y + 4,
        right: 'auto'
      }
    : undefined;

  return {
    isMenuOpen,
    menuStyle,
    itemRef,
    buttonRef,
    isPressed: longPress.isPressed,
    longPressHandlers: isPhoneLayout ? longPress.handlers : undefined,
    onOpenChange,
    onContextMenu,
    onButtonKeyDown: isPhoneLayout ? onButtonKeyDown : undefined,
    clearAnchor: () => {
      setMenuAnchor(null);
      setMenuPosition(null);
    }
  };
};

interface FolderRowProps {
  actionLabel: string;
  actionsHintId?: string | undefined;
  downloadActionLabel?: string | undefined;
  fileCount?: number | undefined;
  folderEntry: FolderEntry;
  isPhoneLayout: boolean;
  moveActionLabel?: string | undefined;
  onAction?: ((folderPath: string) => void) | undefined;
  onDownload?: ((folderPath: string) => void) | undefined;
  onMoveFolder?: ((folderPath: string) => void) | undefined;
  onRenameFolder?: ((folderPath: string) => void) | undefined;
  onOpenFolder: (folderPath: string) => void;
  selectionMode: boolean;
  renameActionLabel?: string | undefined;
}

const FolderRow = ({
  actionLabel,
  actionsHintId,
  downloadActionLabel,
  fileCount,
  folderEntry,
  isPhoneLayout,
  moveActionLabel,
  onAction,
  onDownload,
  onMoveFolder,
  onOpenFolder,
  onRenameFolder,
  selectionMode,
  renameActionLabel
}: FolderRowProps) => {
  const hasRenameAction = Boolean(onRenameFolder && renameActionLabel);
  const hasDownloadAction = Boolean(onDownload && downloadActionLabel);
  const hasMoveAction = Boolean(onMoveFolder && moveActionLabel);
  const hasTrashAction = Boolean(onAction);
  const hasMenuActions = hasRenameAction || hasDownloadAction || hasMoveAction || hasTrashAction;
  // On phone, selection mode is about files: folders can be neither opened nor acted on.
  const isInertForSelection = isPhoneLayout && selectionMode;
  const canOpenMenu = hasMenuActions && !isInertForSelection;
  const rowMenu = useRowMenu({ isPhoneLayout, canOpenMenu, suppressNativeContextMenu: false });

  return (
    <li
      ref={rowMenu.itemRef}
      className="resource-list__item dockspace-browser__folder-item"
      onContextMenu={rowMenu.onContextMenu}
    >
      <div
        className="dockspace-browser__folder-row"
        data-selection-mode={selectionMode ? 'true' : 'false'}
      >
        <button
          ref={rowMenu.buttonRef}
          type="button"
          className="dockspace-browser__folder-button"
          aria-disabled={isInertForSelection ? 'true' : undefined}
          aria-describedby={isPhoneLayout && canOpenMenu ? actionsHintId : undefined}
          data-pressed={rowMenu.isPressed ? 'true' : undefined}
          onKeyDown={rowMenu.onButtonKeyDown}
          {...rowMenu.longPressHandlers}
          onClick={() => {
            if (isInertForSelection) {
              return;
            }

            onOpenFolder(folderEntry.fullPath);
          }}
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
          {typeof fileCount === 'number' ? (
            <span className="dockspace-browser__folder-count">{pluralize(fileCount, 'file')}</span>
          ) : null}
          <ChevronRight className="dockspace-browser__folder-chevron" size={14} aria-hidden="true" />
        </button>
        {canOpenMenu ? (
          <DropdownMenu
            className="dockspace-browser__file-actions"
            isOpen={rowMenu.isMenuOpen}
            onOpenChange={rowMenu.onOpenChange}
          >
            {isPhoneLayout ? null : (
              <DropdownMenu.Trigger
                className="dockspace-browser__file-actions-trigger"
                aria-label={`Actions for ${folderEntry.name}`}
                onClick={rowMenu.clearAnchor}
              >
                ⋯
              </DropdownMenu.Trigger>
            )}
            <DropdownMenu.Content
              label={`Actions for ${folderEntry.name}`}
              className="dockspace-browser__file-actions-menu"
              style={rowMenu.menuStyle}
            >
              {hasRenameAction ? (
                <DropdownMenu.Button
                  className="dockspace-browser__file-actions-item"
                  onClick={() => onRenameFolder?.(folderEntry.fullPath)}
                >
                  {renameActionLabel}
                </DropdownMenu.Button>
              ) : null}
              {hasDownloadAction ? (
                <DropdownMenu.Button
                  className="dockspace-browser__file-actions-item"
                  onClick={() => onDownload?.(folderEntry.fullPath)}
                >
                  {downloadActionLabel}
                </DropdownMenu.Button>
              ) : null}
              {(hasRenameAction || hasDownloadAction) && (hasMoveAction || hasTrashAction) ? <DropdownMenu.Separator /> : null}
              {hasMoveAction ? (
                <DropdownMenu.Button
                  className="dockspace-browser__file-actions-item"
                  onClick={() => onMoveFolder?.(folderEntry.fullPath)}
                >
                  {moveActionLabel}
                </DropdownMenu.Button>
              ) : null}
              {hasMoveAction && hasTrashAction ? <DropdownMenu.Separator /> : null}
              {hasTrashAction ? (
                <DropdownMenu.Button
                  className="dockspace-browser__file-actions-item"
                  onClick={() => onAction?.(folderEntry.fullPath)}
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
  actionsHintId?: string | undefined;
  downloadActionLabel?: string | undefined;
  file: FileRecord;
  isPhoneLayout: boolean;
  isPreviewed: boolean;
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
  actionsHintId,
  downloadActionLabel,
  file,
  isPhoneLayout,
  isPreviewed,
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
  const fileName = fileNameFromPath(file.fullPath);
  const canOpenMenu = !selectionMode;
  const rowMenu = useRowMenu({ isPhoneLayout, canOpenMenu, suppressNativeContextMenu: true });

  return (
    <li
      ref={rowMenu.itemRef}
      className={`resource-list__item dockspace-browser__file-item${
        isPreviewed ? ' dockspace-browser__file-item--previewed' : ''
      }`}
      onContextMenu={rowMenu.onContextMenu}
    >
      <div
        className="dockspace-browser__file-row"
        data-selected={isSelected ? 'true' : 'false'}
        data-selection-mode={selectionMode ? 'true' : 'false'}
      >
        <button
          ref={rowMenu.buttonRef}
          type="button"
          className="dockspace-browser__file-open"
          data-file-path={file.fullPath}
          aria-current={isPreviewed ? 'true' : undefined}
          aria-describedby={isPhoneLayout && canOpenMenu ? actionsHintId : undefined}
          data-pressed={rowMenu.isPressed ? 'true' : undefined}
          onKeyDown={rowMenu.onButtonKeyDown}
          {...rowMenu.longPressHandlers}
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
              <span className="dockspace-browser__file-icon-slot">
                <span className="dockspace-browser__file-icon-wrap">
                  <FileIcon
                    className="dockspace-browser__file-icon"
                    size={16}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
              </span>
              <span className="dockspace-browser__file-name">{fileName}</span>
            </span>
            <span className="dockspace-browser__file-size">{formatFileSize(file.size) ?? ''}</span>
            <span className="dockspace-browser__file-date">{formatModifiedDate(file.updatedAt) ?? ''}</span>
          </span>
        </button>
        {onToggleSelection ? (
          // Sibling of the row button (not nested in it), drawn over the icon slot by CSS.
          <span className="dockspace-browser__file-checkbox-wrap">
            <input
              type="checkbox"
              className="dockspace-browser__row-checkbox"
              checked={isSelected}
              onChange={() => onToggleSelection(file.fullPath)}
              aria-label={`Select ${fileName}`}
            />
          </span>
        ) : null}
        {canOpenMenu ? (
          <DropdownMenu
            className="dockspace-browser__file-actions"
            isOpen={rowMenu.isMenuOpen}
            onOpenChange={rowMenu.onOpenChange}
          >
            {isPhoneLayout ? null : (
              <DropdownMenu.Trigger
                className="dockspace-browser__file-actions-trigger"
                aria-label={`Actions for ${fileName}`}
                onClick={rowMenu.clearAnchor}
              >
                ⋯
              </DropdownMenu.Trigger>
            )}
            <DropdownMenu.Content
              label={`Actions for ${fileName}`}
              className="dockspace-browser__file-actions-menu"
              style={rowMenu.menuStyle}
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
  folderDownloadActionLabel?: string | undefined;
  folderMoveActionLabel?: string | undefined;
  folderRenameActionLabel?: string | undefined;
  folders: FolderRecord[];
  onDownload?: ((file: FileRecord) => void) | undefined;
  onDownloadFolder?: ((folderPath: string) => void) | undefined;
  onOpenFile?: ((file: FileRecord) => void) | undefined;
  onRename?: ((fullPath: string) => void) | undefined;
  onRenameFolder?: ((folderPath: string) => void) | undefined;
  onMoveFolder?: ((folderPath: string) => void) | undefined;
  onAction: (fullPath: string) => void;
  onActionFolder?: ((folderPath: string) => void) | undefined;
  onOpenFolder: (folderPath: string) => void;
  pendingFolderPaths: string[];
  pendingFolderTrashPaths: string[];
  pendingUploadFiles: PendingUploadFileEntry[];
  pendingUploadFolderPaths: string[];
  renameActionLabel?: string | undefined;
  columnTitle?: string | undefined;
  folderFileCounts?: ReadonlyMap<string, number> | undefined;
  previewedFilePath?: string | null | undefined;
  selectedFilePaths: string[];
  selectionActions?: ReactNode;
  selectionMode?: boolean | undefined;
  isPhoneLayout: boolean;
  statusMessage?: string | null;
  onToggleFileSelection?: ((fullPath: string) => void) | undefined;
}

const FolderModeList = ({
  actionLabel,
  currentFolder,
  downloadActionLabel,
  emptyState,
  files,
  folderDownloadActionLabel,
  folderMoveActionLabel,
  folderRenameActionLabel,
  folders,
  onDownload,
  onDownloadFolder,
  onOpenFile,
  onRename,
  onRenameFolder,
  onMoveFolder,
  onAction,
  onActionFolder,
  onOpenFolder,
  pendingFolderPaths,
  pendingFolderTrashPaths,
  pendingUploadFiles,
  pendingUploadFolderPaths,
  renameActionLabel,
  columnTitle,
  folderFileCounts,
  previewedFilePath,
  selectedFilePaths,
  selectionActions,
  selectionMode: selectionModeOverride,
  isPhoneLayout,
  statusMessage,
  onToggleFileSelection
}: FolderModeListProps) => {
  const normalizedCurrentFolder = normalizeFolderPath(currentFolder);
  const selectedFilePathSet = useMemo(() => new Set(selectedFilePaths), [selectedFilePaths]);
  const selectionMode = selectionModeOverride ?? selectedFilePaths.length > 0;
  const actionsHintId = useId();

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

  const hasEntries = folderEntries.length > 0 || directFiles.length > 0 || pendingFileEntries.length > 0;
  // The folder listing API does not always include sizes; hide the Size column when none is known.
  const hasSizes = directFiles.some((file) => typeof file.size === 'number');

  return (
    <div className="dockspace-browser" data-has-sizes={hasSizes ? 'true' : 'false'}>
      {columnTitle ? (
        <header className="dockspace-column__head dockspace-column__head--current">
          <h2 className="dockspace-column__label dockspace-column__label--current">
            {columnTitle}
            <span className="dockspace-column__counts">
              {' · '}
              {pluralize(folders.length, 'folder')}, {pluralize(directFiles.length, 'file')}
            </span>
          </h2>
          {hasEntries ? (
            <>
              <span className="dockspace-column__col-label dockspace-column__col-label--size" aria-hidden="true">
                Size
              </span>
              <span className="dockspace-column__col-label dockspace-column__col-label--date" aria-hidden="true">
                Modified
              </span>
            </>
          ) : null}
        </header>
      ) : null}
      {selectionActions || statusMessage ? (
        <div className="dockspace-browser__sticky">
          {statusMessage ? (
            <p className="dockspace-browser__selection-feedback" role="status">
              {statusMessage}
            </p>
          ) : null}
          {selectionActions ? <div className="dockspace-browser__selection-bar">{selectionActions}</div> : null}
        </div>
      ) : null}

      {isPhoneLayout ? (
        <span id={actionsHintId} className="visually-hidden">
          Press and hold, or press Shift+F10, for more actions.
        </span>
      ) : null}
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
              actionsHintId={actionsHintId}
              isPhoneLayout={isPhoneLayout}
              downloadActionLabel={folderDownloadActionLabel}
              fileCount={folderFileCounts?.get(folderEntry.fullPath)}
              folderEntry={folderEntry}
              moveActionLabel={folderMoveActionLabel}
              onAction={onActionFolder}
              onDownload={onDownloadFolder}
              onMoveFolder={onMoveFolder}
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
            actionsHintId={actionsHintId}
            isPhoneLayout={isPhoneLayout}
            downloadActionLabel={downloadActionLabel}
            file={file}
            isPreviewed={previewedFilePath === file.fullPath}
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
  actionLabelWhilePending,
  currentFolder = '/',
  downloadActionLabel,
  emptyState,
  files,
  folderDownloadActionLabel,
  folderMoveActionLabel,
  folderRenameActionLabel,
  folders = [],
  onDownload,
  onDownloadFolder,
  onOpenFile,
  onRename,
  onRenameFolder,
  onMoveFolder,
  onAction,
  onActionFolder,
  onOpenFolder,
  onToggleFileSelection,
  pendingFolderPaths = [],
  pendingActionPath = null,
  pendingSecondaryActionPath = null,
  pendingFolderTrashPaths = [],
  pendingUploadFiles = [],
  pendingUploadFolderPaths = [],
  renameActionLabel,
  columnTitle,
  folderFileCounts,
  previewedFilePath = null,
  secondaryActionLabel,
  secondaryActionLabelWhilePending,
  secondaryActionVariant = 'secondary',
  selectedFilePaths = [],
  selectionActions,
  selectionMode,
  isPhoneLayout = false,
  statusMessage,
  onSecondaryAction
}: FileListProps) => {
  if (!onOpenFolder) {
    return (
      <FlatFileList
        actionLabel={actionLabel}
        actionLabelWhilePending={actionLabelWhilePending}
        files={files}
        pendingActionPath={pendingActionPath}
        pendingSecondaryActionPath={pendingSecondaryActionPath}
        secondaryActionLabel={secondaryActionLabel}
        secondaryActionLabelWhilePending={secondaryActionLabelWhilePending}
        secondaryActionVariant={secondaryActionVariant}
        onSecondaryAction={onSecondaryAction}
        onAction={onAction}
      />
    );
  }

  return (
    <FolderModeList
      actionLabel={actionLabel}
      currentFolder={currentFolder}
      downloadActionLabel={downloadActionLabel}
      emptyState={emptyState}
      files={files}
      folderDownloadActionLabel={folderDownloadActionLabel}
      folderMoveActionLabel={folderMoveActionLabel}
      folderRenameActionLabel={folderRenameActionLabel}
      folders={folders}
      onDownload={onDownload}
      onDownloadFolder={onDownloadFolder}
      onOpenFile={onOpenFile}
      onRename={onRename}
      onRenameFolder={onRenameFolder}
      onMoveFolder={onMoveFolder}
      onAction={onAction}
      onActionFolder={onActionFolder}
      onOpenFolder={onOpenFolder}
      pendingFolderPaths={pendingFolderPaths}
      pendingFolderTrashPaths={pendingFolderTrashPaths}
      pendingUploadFiles={pendingUploadFiles}
      pendingUploadFolderPaths={pendingUploadFolderPaths}
      renameActionLabel={renameActionLabel}
      columnTitle={columnTitle}
      folderFileCounts={folderFileCounts}
      previewedFilePath={previewedFilePath}
      selectedFilePaths={selectedFilePaths}
      selectionActions={selectionActions}
      selectionMode={selectionMode}
      isPhoneLayout={isPhoneLayout}
      statusMessage={statusMessage ?? null}
      onToggleFileSelection={onToggleFileSelection}
    />
  );
};
