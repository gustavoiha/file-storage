import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildPathInFolder,
  isValidUploadPath,
  normalizeUploadPath
} from '@/components/files/pathHelpers';

type UploadItemStatus = 'pending' | 'uploading';

export interface ActiveUploadFile {
  id: number;
  file: File;
  sourcePath: string;
  destinationPath: string;
  fullPath: string;
  status: UploadItemStatus;
  progress: number;
}

interface UseDockspaceUploadDialogParams {
  currentFolderPath: string;
  uploadFile: (params: {
    fullPath: string;
    file: File;
    onProgress?: (progress: number) => void;
  }) => Promise<unknown>;
}

export const useDockspaceUploadDialog = ({
  currentFolderPath,
  uploadFile
}: UseDockspaceUploadDialogParams) => {
  const [activeUploads, setActiveUploads] = useState<ActiveUploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const nextUploadIdRef = useRef(1);
  const processingUploadIdRef = useRef<number | null>(null);

  const enqueueUploads = useCallback((nextUploads: ActiveUploadFile[]) => {
    if (!nextUploads.length) {
      return;
    }

    setActiveUploads((previous) => previous.concat(nextUploads));
    setValidationError(null);
  }, []);

  const stageFiles = useCallback((selectedFiles: File[]) => {
    if (!selectedFiles.length) {
      return;
    }

    const nextUploads: ActiveUploadFile[] = [];
    let skippedCount = 0;

    for (const file of selectedFiles) {
      const destinationPath = normalizeUploadPath(file.name);
      if (!isValidUploadPath(destinationPath)) {
        skippedCount += 1;
        continue;
      }

      nextUploads.push({
        id: nextUploadIdRef.current++,
        file,
        sourcePath: file.name,
        destinationPath,
        fullPath: buildPathInFolder(currentFolderPath, destinationPath),
        status: 'pending',
        progress: 0
      });
    }

    if (skippedCount > 0) {
      const suffix = skippedCount === 1 ? '' : 's';
      setValidationError(`${skippedCount} file${suffix} had invalid upload paths and were skipped.`);
    }

    enqueueUploads(nextUploads);
  }, [currentFolderPath, enqueueUploads]);

  const stageFolderFiles = useCallback((selectedFiles: File[]) => {
    if (!selectedFiles.length) {
      return;
    }

    const nextUploads: ActiveUploadFile[] = [];
    let skippedCount = 0;

    for (const file of selectedFiles) {
      const destinationPath = normalizeUploadPath(file.webkitRelativePath || file.name);
      if (!isValidUploadPath(destinationPath)) {
        skippedCount += 1;
        continue;
      }

      nextUploads.push({
        id: nextUploadIdRef.current++,
        file,
        sourcePath: destinationPath,
        destinationPath,
        fullPath: buildPathInFolder(currentFolderPath, destinationPath),
        status: 'pending',
        progress: 0
      });
    }

    if (skippedCount > 0) {
      const suffix = skippedCount === 1 ? '' : 's';
      setValidationError(`${skippedCount} file${suffix} had invalid upload paths and were skipped.`);
    }

    enqueueUploads(nextUploads);
  }, [currentFolderPath, enqueueUploads]);

  useEffect(() => {
    if (processingUploadIdRef.current !== null) {
      return;
    }

    const nextUpload = activeUploads.find((item) => item.status === 'pending');
    if (!nextUpload) {
      setIsUploading(false);
      return;
    }

    processingUploadIdRef.current = nextUpload.id;
    setIsUploading(true);
    setActiveUploads((previous) =>
      previous.map((item) =>
        item.id === nextUpload.id
          ? {
              ...item,
              status: 'uploading',
              progress: 0
            }
          : item
      )
    );

    void uploadFile({
      fullPath: nextUpload.fullPath,
      file: nextUpload.file,
      onProgress: (progress) => {
        setActiveUploads((previous) =>
          previous.map((item) =>
            item.id === nextUpload.id
              ? {
                  ...item,
                  progress
                }
              : item
          )
        );
      }
    })
      .catch((error) => {
        setValidationError(error instanceof Error ? error.message : 'Upload failed.');
      })
      .finally(() => {
        setActiveUploads((previous) => previous.filter((item) => item.id !== nextUpload.id));
        processingUploadIdRef.current = null;
        setIsUploading(false);
      });
  }, [activeUploads, uploadFile]);

  const clearValidationError = useCallback(() => {
    setValidationError(null);
  }, []);

  return {
    activeUploads,
    clearValidationError,
    isUploading,
    stageFolderFiles,
    stageFiles,
    validationError
  };
};
