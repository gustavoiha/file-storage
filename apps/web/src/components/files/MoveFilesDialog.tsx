import type { FormEventHandler } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

interface MoveFilesDialogOption {
  path: string;
  label: string;
}

interface MoveFilesDialogProps {
  destinationFolderPath: string;
  destinationOptions: MoveFilesDialogOption[];
  errorMessage: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
  selectedFileCount: number;
  onClose: () => void;
  onDestinationFolderPathChange: (nextValue: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export const MoveFilesDialog = ({
  destinationFolderPath,
  destinationOptions,
  errorMessage,
  isOpen,
  isSubmitting,
  selectedFileCount,
  onClose,
  onDestinationFolderPathChange,
  onSubmit
}: MoveFilesDialogProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="dockspace-dialog-backdrop">
      <dialog
        className="dockspace-dialog"
        open
        aria-modal="true"
        aria-label="Move files"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <h3 className="dockspace-dialog__title">Move files</h3>
        <form onSubmit={onSubmit}>
          <p className="dockspace-dialog__description">
            {selectedFileCount} file{selectedFileCount === 1 ? '' : 's'} selected.
          </p>
          <label className="ui-field" htmlFor="move-files-target-folder">
            <span className="ui-field__label">Destination folder</span>
            <select
              id="move-files-target-folder"
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
            <Button type="submit" disabled={isSubmitting || !selectedFileCount}>
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
