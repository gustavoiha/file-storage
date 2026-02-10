import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useUploadFile } from '@/hooks/useFiles';
import { buildPathInFolder, isValidFileName } from './pathHelpers';

interface UploadFormProps {
  vaultId: string;
  folder: string;
}

interface StagedUploadFile {
  id: number;
  file: File;
  name: string;
}

export const UploadForm = ({ vaultId, folder }: UploadFormProps) => {
  const uploadMutation = useUploadFile(vaultId, folder);
  const [stagedFiles, setStagedFiles] = useState<StagedUploadFile[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const nextIdRef = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    if (!selected.length) {
      return;
    }

    setStagedFiles((previous) => [
      ...previous,
      ...selected.map((file) => ({
        id: nextIdRef.current++,
        file,
        name: file.name
      }))
    ]);
    setValidationError(null);

    // Allow selecting the same files again in a subsequent pick.
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const onFileNameChange = (id: number, name: string) => {
    setStagedFiles((previous) =>
      previous.map((item) => (item.id === id ? { ...item, name } : item))
    );
    setValidationError(null);
  };

  const removeStagedFile = (id: number) => {
    setStagedFiles((previous) => previous.filter((item) => item.id !== id));
    setValidationError(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stagedFiles.length) {
      return;
    }

    for (const stagedFile of stagedFiles) {
      if (!isValidFileName(stagedFile.name)) {
        setValidationError('Each selected file needs a valid name (no slashes).');
        return;
      }
    }

    setValidationError(null);

    for (const stagedFile of stagedFiles) {
      await uploadMutation.mutateAsync({
        fullPath: buildPathInFolder(folder, stagedFile.name),
        file: stagedFile.file
      });
    }

    setStagedFiles([]);
  };

  const submitDisabled = uploadMutation.isPending || !stagedFiles.length;
  const errorMessage =
    validationError ??
    (uploadMutation.error instanceof Error ? uploadMutation.error.message : null);

  return (
    <form onSubmit={onSubmit}>
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
      {stagedFiles.length ? (
        <ul className="upload-staging-list">
          {stagedFiles.map((stagedFile) => (
            <li key={stagedFile.id} className="upload-staging-list__item">
              <p className="upload-staging-list__meta">
                Original file: {stagedFile.file.name} ({stagedFile.file.size} bytes)
              </p>
              <label className="ui-field" htmlFor={`upload-name-${stagedFile.id}`}>
                <span className="ui-field__label">File name</span>
                <input
                  id={`upload-name-${stagedFile.id}`}
                  className="ui-input"
                  value={stagedFile.name}
                  onChange={(event) => onFileNameChange(stagedFile.id, event.target.value)}
                  disabled={uploadMutation.isPending}
                />
              </label>
              <div className="upload-staging-list__actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => removeStagedFile(stagedFile.id)}
                  disabled={uploadMutation.isPending}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {errorMessage ? <Alert message={errorMessage} /> : null}
      <Button type="submit" disabled={submitDisabled}>
        {uploadMutation.isPending ? 'Uploading...' : 'Upload Files'}
      </Button>
    </form>
  );
};
