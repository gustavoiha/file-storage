import { useEffect, useState, type FormEvent } from 'react';
import { buildPathInFolder, isValidFileName } from '@/components/files/pathHelpers';

interface UseAddFolderDialogParams {
  createFolder: (fullPath: string) => Promise<unknown>;
  currentFolderPath: string;
  fetchedFolderPaths: string[];
}

export const useAddFolderDialog = ({
  createFolder,
  currentFolderPath,
  fetchedFolderPaths
}: UseAddFolderDialogParams) => {
  const [pendingFolderPaths, setPendingFolderPaths] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchedPaths = new Set(fetchedFolderPaths);
    setPendingFolderPaths((previous) => {
      const nextPending = previous.filter((pendingPath) => !fetchedPaths.has(pendingPath));
      if (
        nextPending.length === previous.length &&
        nextPending.every((pendingPath, index) => pendingPath === previous[index])
      ) {
        return previous;
      }

      return nextPending;
    });
  }, [fetchedFolderPaths]);

  const openDialog = () => {
    setIsDialogOpen(true);
    setErrorMessage(null);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setErrorMessage(null);
  };

  const onFolderNameChange = (nextValue: string) => {
    setFolderName(nextValue);
    setErrorMessage(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedFolderName = folderName.trim();

    if (!isValidFileName(trimmedFolderName)) {
      setErrorMessage('Folder name cannot be empty and cannot include slashes.');
      return;
    }

    const nextFolderPath = buildPathInFolder(currentFolderPath, trimmedFolderName);

    setPendingFolderPaths((previous) =>
      previous.includes(nextFolderPath) ? previous : [...previous, nextFolderPath]
    );
    setErrorMessage(null);

    try {
      await createFolder(nextFolderPath);
      setFolderName('');
      setIsDialogOpen(false);
    } catch (error) {
      setPendingFolderPaths((previous) =>
        previous.filter((pendingPath) => pendingPath !== nextFolderPath)
      );
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create folder');
    }
  };

  return {
    closeDialog,
    errorMessage,
    folderName,
    isDialogOpen,
    onFolderNameChange,
    onSubmit,
    openDialog,
    pendingFolderPaths
  };
};
