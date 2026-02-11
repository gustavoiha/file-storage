import { Link } from '@tanstack/react-router';
import type { ChangeEventHandler, RefObject } from 'react';
import { DropdownMenu } from '@/components/ui/DropdownMenu';

interface VaultFilesHeaderActionsProps {
  fileInputRef: RefObject<HTMLInputElement>;
  isMenuOpen: boolean;
  onMenuOpenChange: (nextOpen: boolean) => void;
  vaultId: string;
  onAddFolder: () => void;
  onUploadFiles: () => void;
  onUploadSelection: ChangeEventHandler<HTMLInputElement>;
}

export const VaultFilesHeaderActions = ({
  fileInputRef,
  isMenuOpen,
  onMenuOpenChange,
  vaultId,
  onAddFolder,
  onUploadFiles,
  onUploadSelection
}: VaultFilesHeaderActionsProps) => (
  <DropdownMenu className="vault-page-menu" isOpen={isMenuOpen} onOpenChange={onMenuOpenChange}>
    <input
      ref={fileInputRef}
      className="vault-files__hidden-input"
      type="file"
      multiple
      onChange={onUploadSelection}
    />
    <DropdownMenu.Trigger
      className="vault-page-menu__trigger"
      aria-label="Vault options"
    >
      ⋯
    </DropdownMenu.Trigger>
    <DropdownMenu.Content className="vault-page-menu__dropdown" label="Vault actions">
      <DropdownMenu.Button
        className="vault-page-menu__item vault-page-menu__item--button"
        onClick={onAddFolder}
      >
        Create folder
      </DropdownMenu.Button>
      <DropdownMenu.Button
        className="vault-page-menu__item vault-page-menu__item--button"
        onClick={onUploadFiles}
      >
        Upload files
      </DropdownMenu.Button>
      <DropdownMenu.Separator />
      <DropdownMenu.Link asChild className="vault-page-menu__item">
        <Link to="/vaults/$vaultId/trash" params={{ vaultId }}>
          Trash
        </Link>
      </DropdownMenu.Link>
    </DropdownMenu.Content>
  </DropdownMenu>
);
