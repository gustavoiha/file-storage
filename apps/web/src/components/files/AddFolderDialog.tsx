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
    <div className="vault-dialog-backdrop" role="presentation">
      <div className="vault-dialog" role="dialog" aria-modal="true" aria-label="Add folder">
        <h3 className="vault-dialog__title">Add folder</h3>
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
          <div className="vault-dialog__actions">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
