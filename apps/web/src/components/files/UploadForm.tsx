import { useRef, type ChangeEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { useUploadFile } from '@/hooks/useFiles';
import { useDockspaceUploadDialog } from '@/hooks/useDockspaceUploadDialog';
import { UploadStagingList } from '@/components/files/UploadStagingList';
import { ApiError } from '@/lib/apiClient';

interface UploadFormProps {
  dockspaceId: string;
  folder: string;
}

export const UploadForm = ({ dockspaceId, folder }: UploadFormProps) => {
  const uploadMutation = useUploadFile(dockspaceId, folder);
  const uploadDialog = useDockspaceUploadDialog({
    currentFolderPath: folder,
    uploadFile: uploadMutation.mutateAsync
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const onFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    uploadDialog.stageFiles(selected);

    // Allow selecting the same files again in a subsequent pick.
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const onFolderSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    uploadDialog.stageFolderFiles(selected);

    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  };

  const errorMessage =
    uploadDialog.validationError ??
    (uploadMutation.error instanceof ApiError && uploadMutation.error.code === 'UPLOAD_SKIPPED_DUPLICATE'
      ? null
      : uploadMutation.error instanceof Error
        ? uploadMutation.error.message
        : null);

  return (
    <form>
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
          disabled={uploadDialog.isUploading}
        />
      </label>
      <label className="ui-field" htmlFor="upload-folder">
        <span className="ui-field__label">Folder</span>
        <input
          id="upload-folder"
          ref={folderInputRef}
          className="ui-input"
          type="file"
          {...({ webkitdirectory: '' } as Record<string, string>)}
          onChange={onFolderSelection}
          disabled={uploadDialog.isUploading}
        />
      </label>
      <UploadStagingList stagedFiles={uploadDialog.activeUploads} />
      {errorMessage ? <Alert message={errorMessage} /> : null}
    </form>
  );
};
