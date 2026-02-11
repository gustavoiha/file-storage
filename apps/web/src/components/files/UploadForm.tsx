import { useRef, type ChangeEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useUploadFile } from '@/hooks/useFiles';
import { useVaultUploadDialog } from '@/hooks/useVaultUploadDialog';
import { UploadStagingList } from '@/components/files/UploadStagingList';

interface UploadFormProps {
  vaultId: string;
  folder: string;
}

export const UploadForm = ({ vaultId, folder }: UploadFormProps) => {
  const uploadMutation = useUploadFile(vaultId, folder);
  const uploadDialog = useVaultUploadDialog({
    currentFolderPath: folder,
    uploadFile: uploadMutation.mutateAsync
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const onFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    uploadDialog.stageFiles(selected);

    // Allow selecting the same files again in a subsequent pick.
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const submitDisabled = uploadMutation.isPending || !uploadDialog.stagedFiles.length;
  const errorMessage =
    uploadDialog.validationError ??
    (uploadMutation.error instanceof Error ? uploadMutation.error.message : null);

  return (
    <form onSubmit={uploadDialog.onSubmit}>
      <p className="auth-note">Current folder: {folder}</p>
      <label className="ui-field" htmlFor="upload-files">
        <span className="ui-field__label">Files</span>
        <input
          id="upload-files"
          ref={inputRef}
          className="ui-input"
          type="file"
          multiple
          onChange={onFileSelection}
          disabled={uploadMutation.isPending}
        />
      </label>
      <UploadStagingList
        isSubmitting={uploadMutation.isPending}
        stagedFiles={uploadDialog.stagedFiles}
        onFileNameChange={uploadDialog.onFileNameChange}
        onRemoveFile={uploadDialog.removeStagedFile}
      />
      {errorMessage ? <Alert message={errorMessage} /> : null}
      <Button type="submit" disabled={submitDisabled}>
        {uploadMutation.isPending ? 'Uploading...' : 'Upload Files'}
      </Button>
    </form>
  );
};
