import { Link } from '@tanstack/react-router';
import type { ChangeEventHandler, RefObject } from 'react';
import { DropdownMenu } from '@/components/ui/DropdownMenu';

interface DockspaceFilesHeaderActionsProps {
  fileInputRef: RefObject<HTMLInputElement>;
  isMenuOpen: boolean;
  onMenuOpenChange: (nextOpen: boolean) => void;
  dockspaceId: string;
  onAddFolder: () => void;
  onUploadFiles: () => void;
  onUploadSelection: ChangeEventHandler<HTMLInputElement>;
}

export const DockspaceFilesHeaderActions = ({
  fileInputRef,
  isMenuOpen,
  onMenuOpenChange,
  dockspaceId,
  onAddFolder,
  onUploadFiles,
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
      <DropdownMenu.Separator />
      <DropdownMenu.Link asChild className="dockspace-page-menu__item">
        <Link to="/dockspaces/$dockspaceId/trash" params={{ dockspaceId }}>
          Trash
        </Link>
      </DropdownMenu.Link>
    </DropdownMenu.Content>
  </DropdownMenu>
);
