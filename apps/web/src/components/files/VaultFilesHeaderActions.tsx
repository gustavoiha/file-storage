import { Link } from '@tanstack/react-router';
import type { ChangeEventHandler, RefObject } from 'react';

interface VaultFilesHeaderActionsProps {
  fileInputRef: RefObject<HTMLInputElement>;
  isMenuOpen: boolean;
  vaultId: string;
  onAddFolder: () => void;
  onCloseMenu: () => void;
  onToggleMenu: () => void;
  onUploadFiles: () => void;
  onUploadSelection: ChangeEventHandler<HTMLInputElement>;
}

export const VaultFilesHeaderActions = ({
  fileInputRef,
  isMenuOpen,
  vaultId,
  onAddFolder,
  onCloseMenu,
  onToggleMenu,
  onUploadFiles,
  onUploadSelection
}: VaultFilesHeaderActionsProps) => (
  <div className="vault-page-menu">
    <input
      ref={fileInputRef}
      className="vault-files__hidden-input"
      type="file"
      multiple
      onChange={onUploadSelection}
    />
    <button
      type="button"
      className="vault-page-menu__trigger"
      aria-label="Vault options"
      aria-expanded={isMenuOpen}
      onClick={onToggleMenu}
    >
      ⋯
    </button>
    {isMenuOpen ? (
      <div className="vault-page-menu__dropdown" role="menu" aria-label="Vault actions">
        <button
          type="button"
          className="vault-page-menu__item vault-page-menu__item--button"
          onClick={onAddFolder}
        >
          + Add folder
        </button>
        <button
          type="button"
          className="vault-page-menu__item vault-page-menu__item--button"
          onClick={onUploadFiles}
        >
          Upload files
        </button>
        <Link
          to="/vaults/$vaultId/trash"
          params={{ vaultId }}
          className="vault-page-menu__item"
          onClick={onCloseMenu}
        >
          Trash
        </Link>
      </div>
    ) : null}
  </div>
);
