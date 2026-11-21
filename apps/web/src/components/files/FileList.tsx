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
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { useFileIconForPath } from '@/hooks/useFileIconForPath';
import { useLongPress, type LongPressHandlers } from '@/hooks/useLongPress';
import { focusIsLost, isFocusable } from '@/components/files/useDialogDismiss';
import type { FileRecord, FolderRecord } from '@/lib/apiTypes';
import { formatDateTime, formatFileSize, formatModifiedDate, pluralize } from '@/lib/fileFormat';
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
  /** Label of the folder row menu item that opens the folder info panel (default "Info"). */
  folderInfoActionLabel?: string | undefined;
  renameActionLabel?: string | undefined;
  /** Folder name shown on its own in the current column header (desktop only). */
  columnTitle?: string | undefined;
  /** Direct file counts per folder path, shown on folder rows when known. */
  folderFileCounts?: ReadonlyMap<string, number> | undefined;
  /** Full path of the file currently shown in the preview panel. */
  previewedFilePath?: string | null | undefined;
  /** Full path of the folder currently shown in the folder info panel. */
  infoFolderPath?: string | null | undefined;
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
  /** Flat list: row ids (see `fileRowId`) whose primary action is in progress. */
  pendingActionFileIds?: readonly string[] | undefined;
  /** Flat list: error messages shown inside their own row, keyed by row id (see `fileRowId`). */
  actionErrorMessages?: ReadonlyMap<string, string> | undefined;
  /** Flat list: dismisses the error shown in a row (called with its row id). */
  onDismissActionError?: ((rowId: string) => void) | undefined;
  /**
   * Flat list: a row whose action succeeded and that is leaving the list (see `FlatRowFocusRequest`).
   */
  focusAfterRemoval?: FlatRowFocusRequest | null | undefined;
  secondaryActionLabel?: string | undefined;
  secondaryActionLabelWhilePending?: string | undefined;
  /** Flat list: row ids (see `fileRowId`) whose secondary action is in progress. */
  pendingSecondaryActionFileIds?: readonly string[] | undefined;
  secondaryActionVariant?: 'primary' | 'secondary' | 'danger' | undefined;
  onDownload?: ((file: FileRecord) => void) | undefined;
  onDownloadFolder?: ((folderPath: string) => void) | undefined;
  onRename?: ((fullPath: string) => void) | undefined;
  onRenameFolder?: ((folderPath: string) => void) | undefined;
  onMoveFolder?: ((folderPath: string) => void) | undefined;
  /** Shows "Info" first in each folder row menu; opens the folder info panel for that folder. */
  onShowFolderInfo?: ((folderPath: string) => void) | undefined;
  onOpenFile?: ((file: FileRecord) => void) | undefined;
  onOpenFolder?: (folderPath: string) => void;
  onToggleFileSelection?: ((fullPath: string) => void) | undefined;
  onActionFolder?: ((folderPath: string) => void) | undefined;
  onSecondaryAction?: ((fullPath: string, file: FileRecord) => void) | undefined;
  onAction: (fullPath: string, file: FileRecord) => void;
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

/**
 * Identity of a file row. The trash can hold several files with the same path, so rows prefer
 * the file node id and fall back to the path for records that have none.
 */
export const fileRowId = (file: Pick<FileRecord, 'fileNodeId' | 'fullPath'>): string =>
  file.fileNodeId ?? file.fullPath;

/** Trashed date and time, precise enough to tell two trashed copies of one path apart. */
export const formatTrashedAt = (file: Pick<FileRecord, 'deletedAt'>): string | null =>
  formatDateTime(file.deletedAt);

const describeFlatFile = (file: FileRecord): string => {
  const trashedAt = formatTrashedAt(file);
  return trashedAt ? `${file.fullPath}, trashed ${trashedAt}` : file.fullPath;
};

/**
 * Asks the flat list to keep keyboard focus nearby once a row leaves it (restored, purged). When
 * the row is gone and focus fell to <body>, focus moves to the next row's action button, else the
 * previous row's, else the list itself (or its empty message). Pass a new object per request.
 */
export interface FlatRowFocusRequest {
  rowId: string;
}

/** Rows after the removed one in order, then the rows before it, nearest first. */
const neighbourRowIds = (order: readonly string[], rowId: string): string[] => {
  const index = order.indexOf(rowId);
  if (index < 0) {
    return [];
  }
  return [...order.slice(index + 1), ...order.slice(0, index).reverse()];
};

interface FlatRowErrorProps {
  fileDescription: string;
  message: string;
  onDismiss?: (() => void) | undefined;
}

/**
 * Error shown inside the row it belongs to, so it is next to the button that caused it. On a long
 * list the row can sit at the bottom of the viewport, so the error scrolls itself into view.
 */
const FlatRowError = ({ fileDescription, message, onDismiss }: FlatRowErrorProps) => {
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    errorRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [message]);

  return (
    <div ref={errorRef} className="resource-list__item-error">
      <Alert message={message} />
      {onDismiss ? (
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Dismiss error for ${fileDescription}`}
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      ) : null}
    </div>
  );
};

interface FlatFileListProps {
  actionErrorMessages?: ReadonlyMap<string, string> | undefined;
  actionLabel: string;
  actionLabelWhilePending?: string | undefined;
  files: FileRecord[];
  pendingActionFileIds: readonly string[];
  pendingSecondaryActionFileIds: readonly string[];
  secondaryActionLabel?: string | undefined;
  secondaryActionLabelWhilePending?: string | undefined;
  secondaryActionVariant?: 'primary' | 'secondary' | 'danger' | undefined;
  onSecondaryAction?: ((fullPath: string, file: FileRecord) => void) | undefined;
  onAction: (fullPath: string, file: FileRecord) => void;
  onDismissActionError?: ((rowId: string) => void) | undefined;
  focusAfterRemoval?: FlatRowFocusRequest | null | undefined;
}

const FlatFileList = ({
  actionErrorMessages,
  actionLabel,
  actionLabelWhilePending,
  files,
  focusAfterRemoval,
  pendingActionFileIds,
  pendingSecondaryActionFileIds,
  secondaryActionLabel,
  secondaryActionLabelWhilePending,
  secondaryActionVariant = 'secondary',
  onSecondaryAction,
  onAction,
  onDismissActionError
}: FlatFileListProps) => {
  // Primary action button per row id. Dismissing a row error removes the focused Dismiss button,
  // so focus moves to that row's action button instead of falling back to <body>.
  const actionButtonsRef = useRef(new Map<string, HTMLButtonElement>());

  const setActionButton = (rowId: string) => (element: HTMLButtonElement | null) => {
    if (element) {
      actionButtonsRef.current.set(rowId, element);
    } else {
      actionButtonsRef.current.delete(rowId);
    }
  };

  const dismissActionError = (rowId: string) => {
    actionButtonsRef.current.get(rowId)?.focus();
    onDismissActionError?.(rowId);
  };

  const listRef = useRef<HTMLUListElement>(null);
  const emptyMessageRef = useRef<HTMLParagraphElement>(null);
  // Row order of the last commit, and for each row that left the list the order it last had:
  // the row can be gone before the success that asks for focus arrives, or only after it.
  const previousRowIdsRef = useRef<readonly string[]>([]);
  const removedRowOrdersRef = useRef(new Map<string, readonly string[]>());
  const handledFocusRequestRef = useRef<FlatRowFocusRequest | null>(null);

  useLayoutEffect(() => {
    const rowIds = files.map(fileRowId);
    const currentRowIds = new Set(rowIds);
    const previousRowIds = previousRowIdsRef.current;
    const removedRowOrders = removedRowOrdersRef.current;
    for (const rowId of previousRowIds) {
      if (!currentRowIds.has(rowId)) {
        removedRowOrders.set(rowId, previousRowIds);
      }
    }
    for (const rowId of rowIds) {
      removedRowOrders.delete(rowId);
    }
    previousRowIdsRef.current = rowIds;

    const request = focusAfterRemoval;
    if (!request || handledFocusRequestRef.current === request || currentRowIds.has(request.rowId)) {
      return;
    }

    handledFocusRequestRef.current = request;
    const order = removedRowOrders.get(request.rowId) ?? [];
    removedRowOrders.delete(request.rowId);
    // Leave focus alone if the user already moved it somewhere else while the action ran.
    if (!focusIsLost()) {
      return;
    }

    const target = neighbourRowIds(order, request.rowId)
      .map((rowId) => actionButtonsRef.current.get(rowId))
      .find(isFocusable);
    (target ?? listRef.current ?? emptyMessageRef.current)?.focus();
  }, [files, focusAfterRemoval]);

  if (!files.length) {
    return (
      <p
        ref={emptyMessageRef}
        className="flat-file-list__empty"
        tabIndex={-1}
        data-dialog-focus-fallback=""
      >
        No files found.
      </p>
    );
  }

  return (
    <ul
      ref={listRef}
      className="resource-list flat-file-list"
      tabIndex={-1}
      data-dialog-focus-fallback=""
    >
      {files.map((file) => {
        const rowId = fileRowId(file);
        const trashedAt = formatTrashedAt(file);
        const fileDescription = describeFlatFile(file);
        const isActionPending = pendingActionFileIds.includes(rowId);
        const isSecondaryActionPending = pendingSecondaryActionFileIds.includes(rowId);
        const actionErrorMessage = actionErrorMessages?.get(rowId);
        const currentActionLabel = isActionPending
          ? (actionLabelWhilePending ?? actionLabel)
          : actionLabel;
        const currentSecondaryActionLabel =
          isSecondaryActionPending && secondaryActionLabel
            ? (secondaryActionLabelWhilePending ?? secondaryActionLabel)
            : secondaryActionLabel;

        return (
          <li
            key={rowId}
            className={[
              'resource-list__item resource-list__item--spaced',
              actionErrorMessage ? 'resource-list__item--has-error' : ''
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div>
              <strong>{file.fullPath}</strong>
              {typeof file.size === 'number' ? <p>{file.size} bytes</p> : null}
              {trashedAt ? <p>Trashed {trashedAt}</p> : null}
            </div>
            <div className="resource-list__item-actions">
              {onSecondaryAction && currentSecondaryActionLabel ? (
                <Button
                  variant={secondaryActionVariant}
                  aria-label={`${currentSecondaryActionLabel} ${fileDescription}`}
                  onClick={() => onSecondaryAction(file.fullPath, file)}
                  disabled={isSecondaryActionPending}
                >
                  {currentSecondaryActionLabel}
                </Button>
              ) : null}
              <Button
                ref={setActionButton(rowId)}
                variant="secondary"
                aria-label={`${currentActionLabel} ${fileDescription}`}
                onClick={() => onAction(file.fullPath, file)}
                disabled={isActionPending}
              >
                {currentActionLabel}
              </Button>
            </div>
            {actionErrorMessage ? (
              <FlatRowError
                fileDescription={fileDescription}
                message={actionErrorMessage}
                onDismiss={onDismissActionError ? () => dismissActionError(rowId) : undefined}
              />
            ) : null}
          </li>
        );
      })}
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
  onButtonFocus: (() => void) | undefined;
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
  const resetLongPress = longPress.reset;

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

  // A menu opened from the row (right-click, press and hold, ContextMenu key, Shift+F10) takes focus.
  useEffect(() => {
    if (!isMenuOpen || !openedFromRowRef.current) {
      return;
    }

    itemRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [isMenuOpen]);

  useEffect(() => {
    if (!canOpenMenu && isMenuOpen) {
      resetLongPress();
      setIsMenuOpen(false);
      setMenuAnchor(null);
      setMenuPosition(null);
    }
  }, [canOpenMenu, isMenuOpen, resetLongPress]);

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setMenuAnchor(null);
        setMenuPosition(null);
        if (openedFromRowRef.current) {
          // Return focus to the row when closing left it nowhere (Escape, click or tap outside),
          // but not when a menu action moved it on (e.g. into a dialog).
          setTimeout(() => {
            const active = document.activeElement;
            if (!active || active === document.body) {
              buttonRef.current?.focus();
            }
          }, 0);
        }

        openedFromRowRef.current = false;
        resetLongPress();
      }

      setIsMenuOpen(nextOpen);
    },
    [resetLongPress]
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
      if ((isPhoneLayout && longPress.claim()) || isMenuOpen) {
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

  // If the release after a press and hold still moves focus to the row (behind the open menu),
  // put it back on the first menu item so keyboard and switch users stay in the menu.
  const onButtonFocus = useCallback(() => {
    if (!isMenuOpen || !longPress.wasLongPressed()) {
      return;
    }

    itemRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [isMenuOpen, longPress]);

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
    onButtonKeyDown,
    onButtonFocus: isPhoneLayout ? onButtonFocus : undefined,
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
  infoActionLabel?: string | undefined;
  isInfoShown: boolean;
  isPhoneLayout: boolean;
  moveActionLabel?: string | undefined;
  onAction?: ((folderPath: string) => void) | undefined;
  onDownload?: ((folderPath: string) => void) | undefined;
  onMoveFolder?: ((folderPath: string) => void) | undefined;
  onRenameFolder?: ((folderPath: string) => void) | undefined;
  onShowFolderInfo?: ((folderPath: string) => void) | undefined;
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
  infoActionLabel = 'Info',
  isInfoShown,
  isPhoneLayout,
  moveActionLabel,
  onAction,
  onDownload,
  onMoveFolder,
  onOpenFolder,
  onRenameFolder,
  onShowFolderInfo,
  selectionMode,
  renameActionLabel
}: FolderRowProps) => {
  const hasInfoAction = Boolean(onShowFolderInfo && infoActionLabel);
  const hasRenameAction = Boolean(onRenameFolder && renameActionLabel);
  const hasDownloadAction = Boolean(onDownload && downloadActionLabel);
  const hasMoveAction = Boolean(onMoveFolder && moveActionLabel);
  const hasTrashAction = Boolean(onAction);
  const hasOtherActions = hasRenameAction || hasDownloadAction || hasMoveAction || hasTrashAction;
  const hasMenuActions = hasInfoAction || hasOtherActions;
  // On phone, selection mode is about files: folders can be neither opened nor acted on.
  const isInertForSelection = isPhoneLayout && selectionMode;
  const canOpenMenu = hasMenuActions && !isInertForSelection;
  const rowMenu = useRowMenu({ isPhoneLayout, canOpenMenu, suppressNativeContextMenu: false });

  return (
    <li
      ref={rowMenu.itemRef}
      className={`resource-list__item dockspace-browser__folder-item${
        isInfoShown ? ' dockspace-browser__folder-item--info' : ''
      }`}
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
          data-row-path={folderEntry.fullPath}
          aria-current={isInfoShown ? 'true' : undefined}
          aria-disabled={isInertForSelection ? 'true' : undefined}
          aria-describedby={isPhoneLayout && canOpenMenu ? actionsHintId : undefined}
          data-pressed={rowMenu.isPressed ? 'true' : undefined}
          onKeyDown={rowMenu.onButtonKeyDown}
          onFocus={rowMenu.onButtonFocus}
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
              data-return-focus={rowMenu.menuStyle ? 'row' : undefined}
            >
              {hasInfoAction ? (
                <>
                  <DropdownMenu.Button
                    className="dockspace-browser__file-actions-item"
                    onClick={() => onShowFolderInfo?.(folderEntry.fullPath)}
                  >
                    {infoActionLabel}
                  </DropdownMenu.Button>
                  {hasOtherActions ? <DropdownMenu.Separator /> : null}
                </>
              ) : null}
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
  onAction: (fullPath: string, file: FileRecord) => void;
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
          data-row-path={file.fullPath}
          aria-current={isPreviewed ? 'true' : undefined}
          aria-describedby={isPhoneLayout && canOpenMenu ? actionsHintId : undefined}
          data-pressed={rowMenu.isPressed ? 'true' : undefined}
          onKeyDown={rowMenu.onButtonKeyDown}
          onFocus={rowMenu.onButtonFocus}
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
              data-return-focus={rowMenu.menuStyle ? 'row' : undefined}
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
                onClick={() => onAction(file.fullPath, file)}
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
  folderInfoActionLabel?: string | undefined;
  folders: FolderRecord[];
  onDownload?: ((file: FileRecord) => void) | undefined;
  onDownloadFolder?: ((folderPath: string) => void) | undefined;
  onOpenFile?: ((file: FileRecord) => void) | undefined;
  onRename?: ((fullPath: string) => void) | undefined;
  onRenameFolder?: ((folderPath: string) => void) | undefined;
  onMoveFolder?: ((folderPath: string) => void) | undefined;
  onShowFolderInfo?: ((folderPath: string) => void) | undefined;
  onAction: (fullPath: string, file: FileRecord) => void;
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
  infoFolderPath?: string | null | undefined;
  selectedFilePaths: string[];
  selectionActions?: ReactNode;
  selectionMode?: boolean | undefined;
  isPhoneLayout: boolean;
  statusMessage?: string | null | undefined;
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
  folderInfoActionLabel,
  folders,
  onDownload,
  onDownloadFolder,
  onOpenFile,
  onRename,
  onRenameFolder,
  onMoveFolder,
  onShowFolderInfo,
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
  infoFolderPath,
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
  // Pages that pass statusMessage (even null) get a status region that is always on the page.
  const hasStatusRegion = statusMessage !== undefined;

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
      {selectionActions || hasStatusRegion ? (
        <div
          className={
            selectionActions || statusMessage
              ? 'dockspace-browser__sticky'
              : 'dockspace-browser__sticky dockspace-browser__sticky--empty'
          }
        >
          {/* The status region stays mounted (empty when there is no message) and only its text changes,
              so screen readers announce each new message (T-0011). */}
          {hasStatusRegion ? (
            <p
              className={
                statusMessage
                  ? 'dockspace-browser__selection-feedback dockspace-browser__selection-feedback--active'
                  : 'dockspace-browser__selection-feedback'
              }
              role="status"
            >
              {statusMessage || null}
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
      <ul className="resource-list dockspace-browser__list" tabIndex={-1} data-dialog-focus-fallback="">
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
              infoActionLabel={folderInfoActionLabel}
              isInfoShown={infoFolderPath === folderEntry.fullPath}
              moveActionLabel={folderMoveActionLabel}
              onAction={onActionFolder}
              onDownload={onDownloadFolder}
              onMoveFolder={onMoveFolder}
              onRenameFolder={onRenameFolder}
              onShowFolderInfo={onShowFolderInfo}
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
  actionErrorMessages,
  actionLabel,
  actionLabelWhilePending,
  currentFolder = '/',
  downloadActionLabel,
  emptyState,
  files,
  folderDownloadActionLabel,
  folderMoveActionLabel,
  folderRenameActionLabel,
  folderInfoActionLabel,
  folders = [],
  onDownload,
  onDownloadFolder,
  onOpenFile,
  onRename,
  onRenameFolder,
  onMoveFolder,
  onShowFolderInfo,
  onAction,
  onActionFolder,
  onDismissActionError,
  focusAfterRemoval,
  onOpenFolder,
  onToggleFileSelection,
  pendingFolderPaths = [],
  pendingActionFileIds = [],
  pendingSecondaryActionFileIds = [],
  pendingFolderTrashPaths = [],
  pendingUploadFiles = [],
  pendingUploadFolderPaths = [],
  renameActionLabel,
  columnTitle,
  folderFileCounts,
  previewedFilePath = null,
  infoFolderPath = null,
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
        actionErrorMessages={actionErrorMessages}
        actionLabel={actionLabel}
        actionLabelWhilePending={actionLabelWhilePending}
        files={files}
        pendingActionFileIds={pendingActionFileIds}
        pendingSecondaryActionFileIds={pendingSecondaryActionFileIds}
        secondaryActionLabel={secondaryActionLabel}
        secondaryActionLabelWhilePending={secondaryActionLabelWhilePending}
        secondaryActionVariant={secondaryActionVariant}
        onSecondaryAction={onSecondaryAction}
        onAction={onAction}
        onDismissActionError={onDismissActionError}
        focusAfterRemoval={focusAfterRemoval}
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
      folderInfoActionLabel={folderInfoActionLabel}
      folders={folders}
      onDownload={onDownload}
      onDownloadFolder={onDownloadFolder}
      onOpenFile={onOpenFile}
      onRename={onRename}
      onRenameFolder={onRenameFolder}
      onMoveFolder={onMoveFolder}
      onShowFolderInfo={onShowFolderInfo}
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
      infoFolderPath={infoFolderPath}
      selectedFilePaths={selectedFilePaths}
      selectionActions={selectionActions}
      selectionMode={selectionMode}
      isPhoneLayout={isPhoneLayout}
      statusMessage={statusMessage}
      onToggleFileSelection={onToggleFileSelection}
    />
  );
};
