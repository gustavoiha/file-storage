import type { FormEventHandler } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import {
  useDialogDismiss,
  useDialogTabTrap,
  useFocusAfterFailedSubmit
} from '@/components/files/useDialogDismiss';

interface ConfirmPurgeFileDialogProps {
  errorMessage: string | null;
  fullPath: string | null;
  /** When the file was trashed, shown so two trashed copies of one path can be told apart. */
  trashedAt?: string | null | undefined;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export const ConfirmPurgeFileDialog = ({
  errorMessage,
  fullPath,
  trashedAt = null,
  isOpen,
  isSubmitting,
  onClose,
  onSubmit
}: ConfirmPurgeFileDialogProps) => {
  const isDialogOpen = isOpen && Boolean(fullPath);
  const { onBackdropMouseDown } = useDialogDismiss({ isOpen: isDialogOpen, onClose });
  const dialogRef = useDialogTabTrap<HTMLDialogElement>(isDialogOpen);
  const cancelRef = useFocusAfterFailedSubmit<HTMLButtonElement>({
    isOpen: isDialogOpen,
    isSubmitting,
    errorMessage
  });

  if (!isDialogOpen || !fullPath) {
    return null;
  }

  return (
    <div className="dockspace-dialog-backdrop" onMouseDown={onBackdropMouseDown}>
      <dialog
        ref={dialogRef}
        className="dockspace-dialog"
        open
        aria-modal="true"
        aria-label="Purge file now"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <h2 className="dockspace-dialog__title">Purge file now</h2>
        <form onSubmit={onSubmit}>
          <p className="auth-note">
            This permanently removes <strong>{fullPath}</strong>
            {trashedAt ? ` (trashed ${trashedAt})` : ''} from storage.
          </p>
          <p className="auth-note">This action cannot be undone.</p>
          {errorMessage ? <Alert message={errorMessage} /> : null}
          <div className="dockspace-dialog__actions">
            <Button type="submit" variant="danger" disabled={isSubmitting}>
              {isSubmitting ? 'Purging...' : 'Purge now'}
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
