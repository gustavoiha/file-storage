import type { FormEventHandler } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

interface ConfirmPurgeFileDialogProps {
  errorMessage: string | null;
  fullPath: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export const ConfirmPurgeFileDialog = ({
  errorMessage,
  fullPath,
  isOpen,
  isSubmitting,
  onClose,
  onSubmit
}: ConfirmPurgeFileDialogProps) => {
  if (!isOpen || !fullPath) {
    return null;
  }

  return (
    <div className="dockspace-dialog-backdrop">
      <dialog
        className="dockspace-dialog"
        open
        aria-modal="true"
        aria-label="Purge file now"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <h3 className="dockspace-dialog__title">Purge file now</h3>
        <form onSubmit={onSubmit}>
          <p className="auth-note">
            This permanently removes <strong>{fullPath}</strong> from storage.
          </p>
          <p className="auth-note">This action cannot be undone.</p>
          {errorMessage ? <Alert message={errorMessage} /> : null}
          <div className="dockspace-dialog__actions">
            <Button type="submit" variant="danger" disabled={isSubmitting}>
              {isSubmitting ? 'Purging...' : 'Purge now'}
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
