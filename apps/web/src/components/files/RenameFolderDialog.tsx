import type { FormEventHandler } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

interface RenameFolderDialogProps {
  errorMessage: string | null;
  folderName: string;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onFolderNameChange: (nextValue: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export const RenameFolderDialog = ({
  errorMessage,
  folderName,
  isOpen,
  isSubmitting,
  onClose,
  onFolderNameChange,
  onSubmit
}: RenameFolderDialogProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="dockspace-dialog-backdrop">
      <dialog
        className="dockspace-dialog"
        open
        aria-modal="true"
        aria-label="Rename folder"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <h3 className="dockspace-dialog__title">Rename folder</h3>
        <form onSubmit={onSubmit}>
          <label className="ui-field" htmlFor="rename-folder-name">
            <span className="ui-field__label">Folder name</span>
            <input
              id="rename-folder-name"
              className="ui-input"
              value={folderName}
              onChange={(event) => onFolderNameChange(event.target.value)}
              autoFocus
              disabled={isSubmitting}
            />
          </label>
          {errorMessage ? <Alert message={errorMessage} /> : null}
          <div className="dockspace-dialog__actions">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Renaming...' : 'Rename'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
};
