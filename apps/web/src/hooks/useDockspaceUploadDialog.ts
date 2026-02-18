import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildPathInFolder,
  isValidUploadPath,
  normalizeUploadPath
} from '@/components/files/pathHelpers';
import { ApiError } from '@/lib/apiClient';

type UploadItemStatus = 'pending' | 'uploading' | 'failed';
const MAX_PARALLEL_UPLOADS = 4;

export interface ActiveUploadFile {
  id: number;
  file: File;
  sourcePath: string;
  destinationPath: string;
  fullPath: string;
  status: UploadItemStatus;
  progress: number;
  errorMessage?: string;
}

export interface SkippedUploadFile {
  fullPath: string;
  duplicateType: 'NAME' | 'CONTENT_HASH';
  reason: string;
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
  const [skippedUploads, setSkippedUploads] = useState<SkippedUploadFile[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const nextUploadIdRef = useRef(1);
  const runningUploadIdsRef = useRef<Set<number>>(new Set());

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
    setSkippedUploads([]);

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
    setSkippedUploads([]);

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
    const availableSlots = MAX_PARALLEL_UPLOADS - runningUploadIdsRef.current.size;
    if (availableSlots <= 0) {
      return;
    }

    const nextUploads = activeUploads
      .filter((item) => item.status === 'pending' && !runningUploadIdsRef.current.has(item.id))
      .slice(0, availableSlots);
    if (!nextUploads.length) {
      return;
    }

    const nextUploadIds = new Set(nextUploads.map((item) => item.id));
    for (const upload of nextUploads) {
      runningUploadIdsRef.current.add(upload.id);
    }

    setActiveUploads((previous) =>
      previous.map((item) =>
        nextUploadIds.has(item.id)
          ? {
              ...item,
              status: 'uploading',
              progress: 0
            }
          : item
      )
    );

    for (const nextUpload of nextUploads) {
      let shouldRemoveFromQueue = true;
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
          const duplicateType = error instanceof ApiError ? error.duplicateType : null;
          if (
            error instanceof ApiError &&
            error.code === 'UPLOAD_SKIPPED_DUPLICATE' &&
            (duplicateType === 'NAME' || duplicateType === 'CONTENT_HASH')
          ) {
            setSkippedUploads((previous) =>
              previous.concat({
                fullPath: error.fullPath ?? nextUpload.fullPath,
                duplicateType,
                reason: error.reason ?? 'Upload skipped due to duplicate.'
              })
            );
            return;
          }

          shouldRemoveFromQueue = false;
          setValidationError(error instanceof Error ? error.message : 'Upload failed.');
          setActiveUploads((previous) =>
            previous.map((item) =>
              item.id === nextUpload.id
                ? {
                    ...item,
                    status: 'failed',
                    errorMessage: error instanceof Error ? error.message : 'Upload failed.'
                  }
                : item
            )
          );
        })
        .finally(() => {
          runningUploadIdsRef.current.delete(nextUpload.id);
          if (shouldRemoveFromQueue) {
            setActiveUploads((previous) => previous.filter((item) => item.id !== nextUpload.id));
          }
        });
    }
  }, [activeUploads, uploadFile]);

  const clearValidationError = useCallback(() => {
    setValidationError(null);
  }, []);

  const clearSkippedUploads = useCallback(() => {
    setSkippedUploads([]);
  }, []);

  const retryUpload = useCallback((uploadId: number) => {
    setValidationError(null);
    setActiveUploads((previous) =>
      previous.map((item) =>
        item.id === uploadId && item.status === 'failed'
          ? (() => {
              const { errorMessage: _errorMessage, ...rest } = item;
              return {
                ...rest,
                status: 'pending' as const,
                progress: 0
              };
            })()
          : item
      )
    );
  }, []);

  return {
    activeUploads,
    clearValidationError,
    clearSkippedUploads,
    isUploading: activeUploads.some(
      (item) => item.status === 'pending' || item.status === 'uploading'
    ),
    retryUpload,
    skippedUploads,
    stageFolderFiles,
    stageFiles,
    validationError
  };
};
