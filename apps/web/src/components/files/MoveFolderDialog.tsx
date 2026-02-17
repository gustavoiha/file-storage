import type { FormEventHandler } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

interface MoveFolderDialogOption {
  path: string;
  label: string;
}

interface MoveFolderDialogProps {
  destinationFolderPath: string;
  destinationOptions: MoveFolderDialogOption[];
  errorMessage: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
  sourceFolderPath: string | null;
  onClose: () => void;
  onDestinationFolderPathChange: (nextValue: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export const MoveFolderDialog = ({
  destinationFolderPath,
  destinationOptions,
  errorMessage,
  isOpen,
  isSubmitting,
  sourceFolderPath,
  onClose,
  onDestinationFolderPathChange,
  onSubmit
}: MoveFolderDialogProps) => {
  if (!isOpen || !sourceFolderPath) {
    return null;
  }

  return (
    <div className="dockspace-dialog-backdrop">
      <dialog
        className="dockspace-dialog"
        open
        aria-modal="true"
        aria-label="Move folder"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <h3 className="dockspace-dialog__title">Move folder</h3>
        <form onSubmit={onSubmit}>
          <p className="dockspace-dialog__description">
            Source folder: <strong>{sourceFolderPath}</strong>
          </p>
          <label className="ui-field" htmlFor="move-folder-target-folder">
            <span className="ui-field__label">Destination folder</span>
            <select
              id="move-folder-target-folder"
              className="ui-input"
              value={destinationFolderPath}
              onChange={(event) => onDestinationFolderPathChange(event.target.value)}
              disabled={isSubmitting}
              autoFocus
            >
              {destinationOptions.map((option) => (
                <option key={option.path} value={option.path}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {errorMessage ? <Alert message={errorMessage} /> : null}
          <div className="dockspace-dialog__actions">
            <Button type="submit" disabled={isSubmitting || !destinationOptions.length}>
              {isSubmitting ? 'Moving...' : 'Move'}
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
