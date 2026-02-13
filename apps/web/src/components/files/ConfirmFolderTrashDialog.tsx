import type { FormEventHandler } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

interface ConfirmFolderTrashDialogProps {
  errorMessage: string | null;
  folderPath: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export const ConfirmFolderTrashDialog = ({
  errorMessage,
  folderPath,
  isOpen,
  isSubmitting,
  onClose,
  onSubmit
}: ConfirmFolderTrashDialogProps) => {
  if (!isOpen || !folderPath) {
    return null;
  }

  return (
    <div className="dockspace-dialog-backdrop">
      <dialog
        className="dockspace-dialog"
        open
        aria-modal="true"
        aria-label="Move folder to trash"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <h3 className="dockspace-dialog__title">Move folder to trash</h3>
        <form onSubmit={onSubmit}>
          <p className="auth-note">
            This will move all files and subfolders inside <strong>{folderPath}</strong> to trash.
          </p>
          <p className="auth-note">Depending on the folder size, this can take a while.</p>
          {errorMessage ? <Alert message={errorMessage} /> : null}
          <div className="dockspace-dialog__actions">
            <Button type="submit" variant="danger" disabled={isSubmitting}>
              {isSubmitting ? 'Moving to trash...' : 'Move to trash'}
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
