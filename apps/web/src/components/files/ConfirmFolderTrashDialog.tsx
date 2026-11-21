import type { FormEventHandler } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  useDialogDismiss,
  useDialogTabTrap,
  useFocusAfterFailedSubmit
} from '@/components/files/useDialogDismiss';

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
  const isDialogOpen = isOpen && Boolean(folderPath);
  const { onBackdropMouseDown } = useDialogDismiss({ isOpen: isDialogOpen, onClose });
  const dialogRef = useDialogTabTrap<HTMLDialogElement>(isDialogOpen);
  const cancelRef = useFocusAfterFailedSubmit<HTMLButtonElement>({
    isOpen: isDialogOpen,
    isSubmitting,
    errorMessage
  });

  if (!isDialogOpen || !folderPath) {
    return null;
  }

  return (
    <div className="dockspace-dialog-backdrop" onMouseDown={onBackdropMouseDown}>
      <dialog
        ref={dialogRef}
        className="dockspace-dialog"
        open
        aria-modal="true"
        aria-label="Move folder to trash"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <h2 className="dockspace-dialog__title">Move folder to trash</h2>
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
            {/* Initial focus on Cancel: pressing Enter right after opening must not delete anything.
                It also takes focus back after a failed submit. */}
            <Button
              ref={cancelRef}
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isSubmitting}
              autoFocus
            >
              Cancel
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
};
