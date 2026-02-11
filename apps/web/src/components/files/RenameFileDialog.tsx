import type { FormEventHandler } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

interface RenameFileDialogProps {
  errorMessage: string | null;
  fileName: string;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onFileNameChange: (nextValue: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export const RenameFileDialog = ({
  errorMessage,
  fileName,
  isOpen,
  isSubmitting,
  onClose,
  onFileNameChange,
  onSubmit
}: RenameFileDialogProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="vault-dialog-backdrop">
      <dialog
        className="vault-dialog"
        open
        aria-modal="true"
        aria-label="Rename file"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <h3 className="vault-dialog__title">Rename file</h3>
        <form onSubmit={onSubmit}>
          <label className="ui-field" htmlFor="rename-file-name">
            <span className="ui-field__label">File name</span>
            <input
              id="rename-file-name"
              className="ui-input"
              value={fileName}
              onChange={(event) => onFileNameChange(event.target.value)}
              autoFocus
              disabled={isSubmitting}
            />
          </label>
          {errorMessage ? <Alert message={errorMessage} /> : null}
          <div className="vault-dialog__actions">
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
