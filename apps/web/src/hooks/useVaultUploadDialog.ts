import { useCallback, useRef, useState, type FormEvent } from 'react';
import { buildPathInFolder, isValidFileName } from '@/components/files/pathHelpers';

export interface StagedUploadFile {
  id: number;
  file: File;
  name: string;
}

interface UseVaultUploadDialogParams {
  currentFolderPath: string;
  uploadFile: (params: { fullPath: string; file: File }) => Promise<unknown>;
}

export const useVaultUploadDialog = ({
  currentFolderPath,
  uploadFile
}: UseVaultUploadDialogParams) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedUploadFile[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const nextUploadIdRef = useRef(1);

  const stageFiles = useCallback((selectedFiles: File[]) => {
    if (!selectedFiles.length) {
      return;
    }

    setStagedFiles((previous) => [
      ...previous,
      ...selectedFiles.map((file) => ({
        id: nextUploadIdRef.current++,
        file,
        name: file.name
      }))
    ]);
    setValidationError(null);
    setIsDialogOpen(true);
  }, []);

  const onFileNameChange = useCallback((id: number, name: string) => {
    setStagedFiles((previous) =>
      previous.map((item) => (item.id === id ? { ...item, name } : item))
    );
    setValidationError(null);
  }, []);

  const removeStagedFile = useCallback((id: number) => {
    setStagedFiles((previous) => previous.filter((item) => item.id !== id));
    setValidationError(null);
  }, []);

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
    setValidationError(null);
  }, []);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
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
        await uploadFile({
          fullPath: buildPathInFolder(currentFolderPath, stagedFile.name),
          file: stagedFile.file
        });
      }

      setStagedFiles([]);
      setIsDialogOpen(false);
    },
    [currentFolderPath, stagedFiles, uploadFile]
  );

  return {
    closeDialog,
    isDialogOpen,
    onFileNameChange,
    onSubmit,
    removeStagedFile,
    stageFiles,
    stagedFiles,
    validationError
  };
};
