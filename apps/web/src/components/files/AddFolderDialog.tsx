import type { FormEventHandler } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

interface AddFolderDialogProps {
  errorMessage: string | null;
  folderName: string;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onFolderNameChange: (nextValue: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export const AddFolderDialog = ({
  errorMessage,
  folderName,
  isOpen,
  isSubmitting,
  onClose,
  onFolderNameChange,
  onSubmit
}: AddFolderDialogProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="dockspace-dialog-backdrop">
      <dialog
        className="dockspace-dialog"
        open
        aria-modal="true"
        aria-label="Add folder"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <h3 className="dockspace-dialog__title">Add folder</h3>
        <form onSubmit={onSubmit}>
          <label className="ui-field" htmlFor="new-folder-name">
            <span className="ui-field__label">Folder name</span>
            <input
              id="new-folder-name"
              className="ui-input"
              value={folderName}
              onChange={(event) => onFolderNameChange(event.target.value)}
              autoFocus
            />
          </label>
          {errorMessage ? <Alert message={errorMessage} /> : null}
          <div className="dockspace-dialog__actions">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
};
