import { Link } from '@tanstack/react-router';
import type { ChangeEventHandler, RefObject } from 'react';
import { DropdownMenu } from '@/components/ui/DropdownMenu';

interface DockspaceFilesHeaderActionsProps {
  fileInputRef: RefObject<HTMLInputElement>;
  folderInputRef: RefObject<HTMLInputElement>;
  isMenuOpen: boolean;
  onMenuOpenChange: (nextOpen: boolean) => void;
  dockspaceId: string;
  onAddFolder: () => void;
  onUploadFolder: () => void;
  onUploadFiles: () => void;
  onUploadFolderSelection: ChangeEventHandler<HTMLInputElement>;
  onUploadSelection: ChangeEventHandler<HTMLInputElement>;
}

export const DockspaceFilesHeaderActions = ({
  fileInputRef,
  folderInputRef,
  isMenuOpen,
  onMenuOpenChange,
  dockspaceId,
  onAddFolder,
  onUploadFolder,
  onUploadFiles,
  onUploadFolderSelection,
  onUploadSelection
}: DockspaceFilesHeaderActionsProps) => (
  <DropdownMenu className="dockspace-page-menu" isOpen={isMenuOpen} onOpenChange={onMenuOpenChange}>
    <input
      ref={fileInputRef}
      className="dockspace-files__hidden-input"
      type="file"
      multiple
      onChange={onUploadSelection}
    />
    <input
      ref={folderInputRef}
      className="dockspace-files__hidden-input"
      type="file"
      {...({ webkitdirectory: '' } as Record<string, string>)}
      onChange={onUploadFolderSelection}
    />
    <DropdownMenu.Trigger
      className="dockspace-page-menu__trigger"
      aria-label="Dockspace options"
    >
      ⋯
    </DropdownMenu.Trigger>
    <DropdownMenu.Content className="dockspace-page-menu__dropdown" label="Dockspace actions">
      <DropdownMenu.Button
        className="dockspace-page-menu__item dockspace-page-menu__item--button"
        onClick={onAddFolder}
      >
        Create folder
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
      <DropdownMenu.Link asChild className="dockspace-page-menu__item">
        <Link to="/dockspaces/$dockspaceId/trash" params={{ dockspaceId }}>
          Trash
        </Link>
      </DropdownMenu.Link>
    </DropdownMenu.Content>
  </DropdownMenu>
);
