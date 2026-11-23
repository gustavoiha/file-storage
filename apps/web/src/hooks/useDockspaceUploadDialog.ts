import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildPathInFolder,
  invalidUploadPathsMessage,
  isValidUploadPath,
  leafFolderPathsForUploads,
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
  /** The folder that was open when the upload was staged: the folder it goes into. */
  folderPath: string;
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
    /** The folder the upload goes into (for a folder upload, the folder holding its top folder). */
    folderPath?: string;
  }) => Promise<unknown>;
  /**
   * When provided, a folder upload first creates every folder of the selection (one request
   * per leaf folder, run sequentially; ancestors are created server-side) and only then
   * starts the parallel file uploads. This way no two uploads ever race to create the same
   * folder. Without it, folders are created on the fly by each upload.
   */
  createFolder?: (folderPath: string) => Promise<unknown>;
  /**
   * Called once when the upload queue drains (nothing pending or uploading) after at least one upload
   * succeeded since the last drain, with the number of files uploaded and their full paths (in the order they
   * finished). Lets a page refresh an expensive listing (e.g. the paged media gallery) once per batch instead of
   * once per file. Failed uploads left in the queue do not hold it back; a later successful retry starts a new batch.
   */
  onBatchComplete?: (uploadedCount: number, uploadedPaths: string[]) => void;
}

export const useDockspaceUploadDialog = ({
  currentFolderPath,
  uploadFile,
  createFolder,
  onBatchComplete
}: UseDockspaceUploadDialogParams) => {
  const [activeUploads, setActiveUploads] = useState<ActiveUploadFile[]>([]);
  const [skippedUploads, setSkippedUploads] = useState<SkippedUploadFile[]>([]);
  // A real error (folder creation or upload failure). Kept apart from the skipped-files notice below so the uploads
  // card can report only real errors as a failed upload, and neither message hides the other.
  const [validationError, setValidationError] = useState<string | null>(null);
  // The notice for files left out of the latest selection because their upload paths are invalid.
  const [invalidPathsNotice, setInvalidPathsNotice] = useState<string | null>(null);
  const [isPreparingFolders, setIsPreparingFolders] = useState(false);
  const nextUploadIdRef = useRef(1);
  const runningUploadIdsRef = useRef<Set<number>>(new Set());
  // Full paths of the uploads that succeeded since the queue last drained.
  const uploadedSinceDrainRef = useRef<string[]>([]);
  // Bumped after every settled upload, once runningUploadIdsRef is updated, so the drain check below always
  // runs with the final running set (a failure only changes an item's status, which may render earlier).
  const [settledUploadCount, setSettledUploadCount] = useState(0);
  const onBatchCompleteRef = useRef(onBatchComplete);
  onBatchCompleteRef.current = onBatchComplete;

  const enqueueUploads = useCallback((nextUploads: ActiveUploadFile[]) => {
    if (!nextUploads.length) {
      return;
    }

    setActiveUploads((previous) => previous.concat(nextUploads));
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
        folderPath: currentFolderPath,
        fullPath: buildPathInFolder(currentFolderPath, destinationPath),
        status: 'pending',
        progress: 0
      });
    }

    // Each selection replaces the previous messages: the skipped-files notice when some paths were invalid (it stays
    // while and after the valid files upload), otherwise nothing; an older error goes away.
    setValidationError(null);
    setInvalidPathsNotice(skippedCount > 0 ? invalidUploadPathsMessage(skippedCount) : null);

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
        folderPath: currentFolderPath,
        fullPath: buildPathInFolder(currentFolderPath, destinationPath),
        status: 'pending',
        progress: 0
      });
    }

    // Each selection replaces the previous messages: the skipped-files notice when some paths were invalid (it stays
    // while and after the valid files upload), otherwise nothing; an older error goes away.
    setValidationError(null);
    setInvalidPathsNotice(skippedCount > 0 ? invalidUploadPathsMessage(skippedCount) : null);

    const folderPaths = createFolder
      ? leafFolderPathsForUploads(
          nextUploads.map((upload) => upload.fullPath),
          currentFolderPath
        )
      : [];

    if (!folderPaths.length) {
      enqueueUploads(nextUploads);
      return;
    }

    setIsPreparingFolders(true);
    void (async () => {
      try {
        for (const folderPath of folderPaths) {
          await createFolder!(folderPath);
        }

        enqueueUploads(nextUploads);
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown error';
        setValidationError(`Could not create the folders for this upload: ${detail}`);
      } finally {
        setIsPreparingFolders(false);
      }
    })();
  }, [createFolder, currentFolderPath, enqueueUploads]);

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
        folderPath: nextUpload.folderPath,
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
        .then(() => {
          uploadedSinceDrainRef.current.push(nextUpload.fullPath);
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
          setSettledUploadCount((previous) => previous + 1);
        });
    }
  }, [activeUploads, uploadFile]);

  useEffect(() => {
    if (uploadedSinceDrainRef.current.length === 0 || runningUploadIdsRef.current.size > 0) {
      return;
    }

    if (activeUploads.some((item) => item.status === 'pending' || item.status === 'uploading')) {
      return;
    }

    const uploadedPaths = uploadedSinceDrainRef.current;
    uploadedSinceDrainRef.current = [];
    onBatchCompleteRef.current?.(uploadedPaths.length, uploadedPaths);
  }, [activeUploads, settledUploadCount]);

  /** Clears the error and the skipped-files notice, e.g. before a new pick. */
  const clearUploadMessages = useCallback(() => {
    setValidationError(null);
    setInvalidPathsNotice(null);
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
    clearUploadMessages,
    clearSkippedUploads,
    isPreparingFolders,
    isUploading:
      isPreparingFolders ||
      activeUploads.some((item) => item.status === 'pending' || item.status === 'uploading'),
    invalidPathsNotice,
    retryUpload,
    skippedUploads,
    stageFolderFiles,
    stageFiles,
    validationError
  };
};
