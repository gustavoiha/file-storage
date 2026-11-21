import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, FolderPlus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DropdownMenu } from '@/components/ui/DropdownMenu';

interface UploadMenuProps {
  /** `bar` is the top-bar button; `floating` is the phone pill at the bottom right. */
  variant: 'bar' | 'floating';
  onUploadFiles: () => void;
  onUploadFolder: () => void;
}

export const UploadMenu = ({ variant, onUploadFiles, onUploadFolder }: UploadMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DropdownMenu
      className={`dockspace-upload-menu dockspace-upload-menu--${variant}`}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
    >
      <DropdownMenu.Trigger className="ui-button ui-button--primary dockspace-upload-menu__trigger">
        <Upload size={15} aria-hidden="true" />
        Upload
        {variant === 'bar' ? <ChevronDown size={14} aria-hidden="true" /> : null}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="dockspace-page-menu__dropdown" label="Upload">
        <DropdownMenu.Button
          className="dockspace-page-menu__item dockspace-page-menu__item--button"
          onClick={onUploadFiles}
        >
          Upload files
        </DropdownMenu.Button>
        <DropdownMenu.Button
          className="dockspace-page-menu__item dockspace-page-menu__item--button"
          onClick={onUploadFolder}
        >
          Upload folder
        </DropdownMenu.Button>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

interface DockspaceOptionsMenuProps {
  dockspaceId: string;
  /** `bar`: Trash and usage only. `phone`: also New folder and the upload actions. */
  variant: 'bar' | 'phone';
  onAddFolder: () => void;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
  /** Phone only: shows "Select items", which turns on selection mode. Omit to hide it. */
  onStartSelection?: (() => void) | undefined;
  /** Shows "Folder info" first, which opens the folder info panel for the open folder. Omit to hide it. */
  onShowFolderInfo?: (() => void) | undefined;
}

export const DockspaceOptionsMenu = ({
  dockspaceId,
  variant,
  onAddFolder,
  onUploadFiles,
  onUploadFolder,
  onStartSelection,
  onShowFolderInfo
}: DockspaceOptionsMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const label = variant === 'phone' ? 'Folder options' : 'Dockspace options';

  return (
    <DropdownMenu className="dockspace-page-menu" isOpen={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenu.Trigger className="dockspace-page-menu__trigger" aria-label={label}>
        ⋯
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="dockspace-page-menu__dropdown" label={label}>
        {onShowFolderInfo ? (
          <>
            <DropdownMenu.Button
              className="dockspace-page-menu__item dockspace-page-menu__item--button"
              onClick={onShowFolderInfo}
            >
              Folder info
            </DropdownMenu.Button>
            <DropdownMenu.Separator />
          </>
        ) : null}
        {variant === 'phone' && onStartSelection ? (
          <>
            <DropdownMenu.Button
              className="dockspace-page-menu__item dockspace-page-menu__item--button"
              onClick={onStartSelection}
            >
              Select items
            </DropdownMenu.Button>
            <DropdownMenu.Separator />
          </>
        ) : null}
        {variant === 'phone' ? (
          <>
            <DropdownMenu.Button
              className="dockspace-page-menu__item dockspace-page-menu__item--button"
              onClick={onAddFolder}
            >
              New folder
            </DropdownMenu.Button>
            <DropdownMenu.Button
              className="dockspace-page-menu__item dockspace-page-menu__item--button"
              onClick={onUploadFiles}
            >
              Upload files
            </DropdownMenu.Button>
            <DropdownMenu.Button
              className="dockspace-page-menu__item dockspace-page-menu__item--button"
              onClick={onUploadFolder}
            >
              Upload folder
            </DropdownMenu.Button>
            <DropdownMenu.Separator />
          </>
        ) : null}
        <DropdownMenu.Link asChild className="dockspace-page-menu__item">
          <Link to="/dockspaces/$dockspaceId/trash" params={{ dockspaceId }}>
            Trash
          </Link>
        </DropdownMenu.Link>
        <DropdownMenu.Link asChild className="dockspace-page-menu__item">
          <Link to="/dockspaces/$dockspaceId/usage" params={{ dockspaceId }}>
            Detailed usage
          </Link>
        </DropdownMenu.Link>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

interface DockspaceFilesHeaderActionsProps {
  dockspaceId: string;
  onAddFolder: () => void;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
  onShowFolderInfo?: (() => void) | undefined;
}

/** Right side of the desktop folder bar: New folder, Upload, and the dockspace options menu. */
export const DockspaceFilesHeaderActions = ({
  dockspaceId,
  onAddFolder,
  onUploadFiles,
  onUploadFolder,
  onShowFolderInfo
}: DockspaceFilesHeaderActionsProps) => (
  <div className="dockspace-folder-bar__actions">
    <Button type="button" variant="secondary" onClick={onAddFolder}>
      <FolderPlus size={15} aria-hidden="true" />
      New folder
    </Button>
    <UploadMenu variant="bar" onUploadFiles={onUploadFiles} onUploadFolder={onUploadFolder} />
    <DockspaceOptionsMenu
      dockspaceId={dockspaceId}
      variant="bar"
      onAddFolder={onAddFolder}
      onUploadFiles={onUploadFiles}
      onUploadFolder={onUploadFolder}
      onShowFolderInfo={onShowFolderInfo}
    />
  </div>
);
