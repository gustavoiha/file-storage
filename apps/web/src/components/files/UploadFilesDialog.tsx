import type { FormEventHandler } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import type { StagedUploadFile } from '@/hooks/useDockspaceUploadDialog';
import { UploadStagingList } from '@/components/files/UploadStagingList';

interface UploadFilesDialogProps {
  errorMessage: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
  stagedFiles: StagedUploadFile[];
  onAddMoreFiles: () => void;
  onClose: () => void;
  onFileNameChange: (id: number, name: string) => void;
  onRemoveFile: (id: number) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export const UploadFilesDialog = ({
  errorMessage,
  isOpen,
  isSubmitting,
  stagedFiles,
  onAddMoreFiles,
  onClose,
  onFileNameChange,
  onRemoveFile,
  onSubmit
}: UploadFilesDialogProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="dockspace-dialog-backdrop">
      <dialog
        className="dockspace-dialog dockspace-dialog--wide"
        open
        aria-modal="true"
        aria-label="Upload files"
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <h3 className="dockspace-dialog__title">Upload files</h3>
        <form onSubmit={onSubmit}>
          <UploadStagingList
            emptyStateMessage="No files selected."
            isSubmitting={isSubmitting}
            stagedFiles={stagedFiles}
            onFileNameChange={onFileNameChange}
            onRemoveFile={onRemoveFile}
          />
          {errorMessage ? <Alert message={errorMessage} /> : null}
          <div className="dockspace-dialog__actions">
            <Button type="button" variant="secondary" onClick={onAddMoreFiles} disabled={isSubmitting}>
              Add more files
            </Button>
            <Button type="submit" disabled={isSubmitting || !stagedFiles.length}>
              {isSubmitting ? 'Uploading...' : 'Upload'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Close
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
};
