import {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
  type ChangeEvent,
  type FormEvent
} from 'react';
import { ArrowLeft } from 'lucide-react';
import { useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { AddFolderDialog } from '@/components/files/AddFolderDialog';
import { ConfirmFolderTrashDialog } from '@/components/files/ConfirmFolderTrashDialog';
import { FileList } from '@/components/files/FileList';
import { FilePreviewPanel } from '@/components/files/FilePreviewPanel';
import {
  AncestorColumn,
  FolderBreadcrumb,
  ParentFolderChips,
  type FolderTrailEntry
} from '@/components/files/FolderNavigation';
import { MoveFilesDialog } from '@/components/files/MoveFilesDialog';
import { MoveFolderDialog } from '@/components/files/MoveFolderDialog';
import { RenameFileDialog } from '@/components/files/RenameFileDialog';
import { RenameFolderDialog } from '@/components/files/RenameFolderDialog';
import {
  DockspaceFilesHeaderActions,
  DockspaceOptionsMenu,
  UploadMenu
} from '@/components/files/DockspaceFilesHeaderActions';
import { UploadsCard } from '@/components/files/UploadsCard';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { buildPathInFolder, normalizeNodeName } from '@/components/files/pathHelpers';
import { Page } from '@/components/ui/Page';
import { useAddFolderDialog } from '@/hooks/useAddFolderDialog';
import {
  useCreateFolder,
  useDiscoverFolder,
  useFiles,
  useMoveFolder,
  useMoveFiles,
  useMoveToTrash,
  useRenameFile,
  useRenameFolder,
  useUploadFile
} from '@/hooks/useFiles';
import { useDockspaceUploadDialog } from '@/hooks/useDockspaceUploadDialog';
import { useDockspaces } from '@/hooks/useDockspaces';
import { PHONE_LAYOUT_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { ApiError } from '@/lib/apiClient';
import type { DirectoryChildRecord, FileRecord } from '@/lib/apiTypes';
import { createFileDownloadSession, createFolderDownloadSession } from '@/lib/dockspaceApi';

const ROOT_FOLDER: FolderTrailEntry = {
  folderNodeId: 'root',
  fullPath: '/',
  name: 'Root'
};

interface FolderDiscoveryNode {
  folderNodeId: string;
  parentFolderNodeId: string | null;
  fullPath: string;
  name: string;
  childFolderNodeIds: string[] | null;
  directFileCount: number | null;
}

const createRootDiscoveryNode = (name: string): FolderDiscoveryNode => ({
  folderNodeId: ROOT_FOLDER.folderNodeId,
  parentFolderNodeId: null,
  fullPath: '/',
  name,
  childFolderNodeIds: null,
  directFileCount: null
});

const mergeDiscoveredFolderItems = (
  previous: Map<string, FolderDiscoveryNode>,
  params: {
    parentFolderNodeId: string;
    parentFolderPath: string;
    parentFolderName: string;
    items: DirectoryChildRecord[];
  }
): Map<string, FolderDiscoveryNode> => {
  const next = new Map(previous);
  const parentExisting = next.get(params.parentFolderNodeId);
  const childFolderNodeIds: string[] = [];
  let directFileCount = 0;

  for (const item of params.items) {
    if (item.childType === 'file') {
      directFileCount += 1;
      continue;
    }

    const childFullPath = buildPathInFolder(params.parentFolderPath, item.name);
    const childExisting = next.get(item.childId);
    childFolderNodeIds.push(item.childId);
    next.set(item.childId, {
      folderNodeId: item.childId,
      parentFolderNodeId: params.parentFolderNodeId,
      fullPath: childFullPath,
      name: item.name,
      childFolderNodeIds: childExisting?.childFolderNodeIds ?? null,
      directFileCount: childExisting?.directFileCount ?? null
    });
  }

  next.set(params.parentFolderNodeId, {
    folderNodeId: params.parentFolderNodeId,
    parentFolderNodeId: parentExisting?.parentFolderNodeId ?? null,
    fullPath: params.parentFolderPath,
    name: params.parentFolderName,
    childFolderNodeIds,
    directFileCount
  });

  return next;
};

const folderNameFromPath = (folderPath: string): string => {
  const segments = folderPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? folderPath;
};

const fileNameFromPath = (fullPath: string): string => {
  const segments = fullPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? fullPath;
};

const parentFolderPathFromPath = (fullPath: string): string => {
  const segments = fullPath.split('/').filter(Boolean);
  if (segments.length <= 1) {
    return '/';
  }

  return `/${segments.slice(0, -1).join('/')}`;
};

const isSameOrDescendantPath = (path: string, maybeAncestorPath: string): boolean =>
  path === maybeAncestorPath || path.startsWith(`${maybeAncestorPath}/`);

const remapPathAfterFolderMove = (
  path: string,
  sourceFolderPath: string,
  destinationFolderPath: string
): string => {
  if (!isSameOrDescendantPath(path, sourceFolderPath)) {
    return path;
  }

  const sourceFolderName = folderNameFromPath(sourceFolderPath);
  const destinationRootPath = buildPathInFolder(destinationFolderPath, sourceFolderName);
  const suffix = path.slice(sourceFolderPath.length);
  return `${destinationRootPath}${suffix}`;
};

const FOLDER_RENAME_CONFLICT_MESSAGE = 'A sibling folder with this name already exists.';

export const DockspaceFilesPage = () => {
  const { dockspaceId } = useParams({ from: '/dockspaces/$dockspaceId' });
  const [folderTrail, setFolderTrail] = useState<FolderTrailEntry[]>([ROOT_FOLDER]);
  const [renameFileDialogFullPath, setRenameFileDialogFullPath] = useState<string | null>(null);
  const [renameFileDialogFileName, setRenameFileDialogFileName] = useState('');
  const [renameFileDialogValidationError, setRenameFileDialogValidationError] = useState<
    string | null
  >(null);
  const [renameFolderDialogPath, setRenameFolderDialogPath] = useState<string | null>(null);
  const [renameFolderDialogName, setRenameFolderDialogName] = useState('');
  const [renameFolderDialogValidationError, setRenameFolderDialogValidationError] = useState<
    string | null
  >(null);
  const [trashFolderDialogPath, setTrashFolderDialogPath] = useState<string | null>(null);
  const [trashFolderDialogError, setTrashFolderDialogError] = useState<string | null>(null);
  const [isTrashingFolder, setIsTrashingFolder] = useState(false);
  const [isMoveFilesDialogOpen, setIsMoveFilesDialogOpen] = useState(false);
  const [moveFilesDialogDestinationPath, setMoveFilesDialogDestinationPath] = useState('/');
  const [moveFilesDialogError, setMoveFilesDialogError] = useState<string | null>(null);
  const [isMoveFolderDialogOpen, setIsMoveFolderDialogOpen] = useState(false);
  const [moveFolderDialogSourcePath, setMoveFolderDialogSourcePath] = useState<string | null>(null);
  const [moveFolderDialogDestinationPath, setMoveFolderDialogDestinationPath] = useState('/');
  const [moveFolderDialogError, setMoveFolderDialogError] = useState<string | null>(null);
  const [moveFilesSummary, setMoveFilesSummary] = useState<string | null>(null);
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]);
  const [pendingFolderTrashPaths, setPendingFolderTrashPaths] = useState<string[]>([]);
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [discoveredFoldersByNodeId, setDiscoveredFoldersByNodeId] = useState<
    Map<string, FolderDiscoveryNode>
  >(() => new Map([[ROOT_FOLDER.folderNodeId, createRootDiscoveryNode(ROOT_FOLDER.name)]]));
  const [loadingFolderNodeIds, setLoadingFolderNodeIds] = useState<Set<string>>(
    () => new Set()
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const focusFileRowAfterCloseRef = useRef<string | null>(null);
  const phoneListScrollYRef = useRef(0);
  const isPhone = useMediaQuery(PHONE_LAYOUT_QUERY);
  const currentFolder = folderTrail[folderTrail.length - 1] ?? ROOT_FOLDER;
  const parentFolder = folderTrail.length > 1 ? folderTrail[folderTrail.length - 2] ?? null : null;

  const dockspacesQuery = useDockspaces();
  const filesQuery = useFiles(dockspaceId, currentFolder.folderNodeId);
  const discoverFolder = useDiscoverFolder(dockspaceId);
  const createFolder = useCreateFolder(dockspaceId);
  const moveFolder = useMoveFolder(dockspaceId);
  const moveFiles = useMoveFiles(dockspaceId, currentFolder.fullPath);
  const moveToTrash = useMoveToTrash(dockspaceId, currentFolder.fullPath);
  const renameFile = useRenameFile(dockspaceId, currentFolder.fullPath);
  const renameFolder = useRenameFolder(dockspaceId, currentFolder.fullPath);
  const uploadFile = useUploadFile(dockspaceId, currentFolder.fullPath);
  const dockspaceName =
    dockspacesQuery.data?.find((dockspace) => dockspace.dockspaceId === dockspaceId)?.name ?? 'Dockspace';

  const unauthorized =
    filesQuery.error instanceof ApiError && filesQuery.error.statusCode === 403;

  const folders = useMemo(
    () =>
      (filesQuery.data?.items ?? [])
        .filter((item) => item.childType === 'folder')
        .map((item) => ({
          folderNodeId: item.childId,
          parentFolderNodeId: item.parentFolderNodeId,
          fullPath: buildPathInFolder(currentFolder.fullPath, item.name),
          name: item.name,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        })),
    [currentFolder.fullPath, filesQuery.data?.items]
  );

  const files = useMemo(
    () =>
      (filesQuery.data?.items ?? [])
        .filter((item) => item.childType === 'file')
        .map(
          (item): FileRecord => ({
            fileNodeId: item.childId,
            fullPath: buildPathInFolder(currentFolder.fullPath, item.name),
            updatedAt: item.updatedAt
          })
        ),
    [currentFolder.fullPath, filesQuery.data?.items]
  );

  useEffect(() => {
    setDiscoveredFoldersByNodeId((previous) => {
      const root = previous.get(ROOT_FOLDER.folderNodeId);
      if (root?.name === dockspaceName) {
        return previous;
      }

      const next = new Map(previous);
      next.set(ROOT_FOLDER.folderNodeId, {
        ...(root ?? createRootDiscoveryNode(dockspaceName)),
        name: dockspaceName
      });
      return next;
    });
  }, [dockspaceName]);

  useEffect(() => {
    const items = filesQuery.data?.items;
    if (!items) {
      return;
    }

    setDiscoveredFoldersByNodeId((previous) =>
      mergeDiscoveredFolderItems(previous, {
        parentFolderNodeId: currentFolder.folderNodeId,
        parentFolderPath: currentFolder.fullPath,
        parentFolderName:
          currentFolder.folderNodeId === ROOT_FOLDER.folderNodeId ? dockspaceName : currentFolder.name,
        items
      })
    );
  }, [
    currentFolder.folderNodeId,
    currentFolder.fullPath,
    currentFolder.name,
    dockspaceName,
    filesQuery.data?.items
  ]);

  useEffect(() => {
    setSelectedFilePaths([]);
    setIsMoveFilesDialogOpen(false);
    setMoveFilesDialogError(null);
    setIsMoveFolderDialogOpen(false);
    setMoveFolderDialogSourcePath(null);
    setMoveFolderDialogError(null);
  }, [currentFolder.fullPath]);

  const folderNodeIdByPath = useMemo(() => {
    const entries = new Map<string, string>();

    for (const trailEntry of folderTrail) {
      entries.set(trailEntry.fullPath, trailEntry.folderNodeId);
    }

    for (const folder of discoveredFoldersByNodeId.values()) {
      entries.set(folder.fullPath, folder.folderNodeId);
    }

    for (const item of folders) {
      entries.set(item.fullPath, item.folderNodeId);
    }

    return entries;
  }, [discoveredFoldersByNodeId, folderTrail, folders]);

  const folderNameByPath = useMemo(() => {
    const names = new Map<string, string>();

    for (const trailEntry of folderTrail) {
      names.set(trailEntry.fullPath, trailEntry.name);
    }

    for (const folder of discoveredFoldersByNodeId.values()) {
      names.set(folder.fullPath, folder.name);
    }

    for (const folder of folders) {
      names.set(folder.fullPath, folder.name);
    }

    return names;
  }, [discoveredFoldersByNodeId, folderTrail, folders]);

  const fetchedFolderPaths = useMemo(
    () => folders.map((folder) => folder.fullPath),
    [folders]
  );

  const addFolderDialog = useAddFolderDialog({
    createFolder: createFolder.mutateAsync,
    currentFolderPath: currentFolder.fullPath,
    fetchedFolderPaths
  });

  const uploadDialog = useDockspaceUploadDialog({
    currentFolderPath: currentFolder.fullPath,
    uploadFile: uploadFile.mutateAsync,
    createFolder: createFolder.mutateAsync
  });

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const openFolderPicker = useCallback(() => {
    folderInputRef.current?.click();
  }, []);

  const onUploadSelection = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      uploadDialog.stageFiles(selectedFiles);

      // Allow selecting the same files again in the next picker interaction.
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [uploadDialog.stageFiles]
  );

  const onUploadFolderSelection = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      uploadDialog.stageFolderFiles(selectedFiles);

      if (folderInputRef.current) {
        folderInputRef.current.value = '';
      }
    },
    [uploadDialog.stageFolderFiles]
  );

  const discoverFolderChildren = useCallback(
    async (folderNodeId: string) => {
      if (loadingFolderNodeIds.has(folderNodeId)) {
        return;
      }

      const folderNode = discoveredFoldersByNodeId.get(folderNodeId);
      if (!folderNode) {
        return;
      }

      if (folderNode.childFolderNodeIds !== null && folderNode.directFileCount !== null) {
        return;
      }

      setLoadingFolderNodeIds((previous) => {
        const next = new Set(previous);
        next.add(folderNodeId);
        return next;
      });

      try {
        const response = await discoverFolder.mutateAsync(folderNodeId);
        setDiscoveredFoldersByNodeId((previous) =>
          mergeDiscoveredFolderItems(previous, {
            parentFolderNodeId: folderNodeId,
            parentFolderPath: folderNode.fullPath,
            parentFolderName: folderNode.name,
            items: response.items
          })
        );
      } finally {
        setLoadingFolderNodeIds((previous) => {
          const next = new Set(previous);
          next.delete(folderNodeId);
          return next;
        });
      }
    },
    [discoverFolder, discoveredFoldersByNodeId, loadingFolderNodeIds]
  );

  const folderLabel = useCallback(
    (entry: FolderTrailEntry) =>
      entry.folderNodeId === ROOT_FOLDER.folderNodeId ? dockspaceName : entry.name,
    [dockspaceName]
  );

  /**
   * Every change of the open folder goes through here. Navigating closes the preview, except when
   * a file in an ancestor column was clicked: then that folder opens and the file is previewed.
   */
  const changeFolderTrail = useCallback(
    (nextTrail: FolderTrailEntry[], nextPreviewFile: FileRecord | null = null) => {
      setFolderTrail(nextTrail.length ? nextTrail : [ROOT_FOLDER]);
      setPreviewFile(nextPreviewFile);
    },
    []
  );

  const onOpenFolder = useCallback(
    (nextFolderPath: string) => {
      const nextFolderNodeId = folderNodeIdByPath.get(nextFolderPath);
      if (!nextFolderNodeId) {
        return;
      }

      const existingIndex = folderTrail.findIndex(
        (trailEntry) => trailEntry.fullPath === nextFolderPath
      );
      changeFolderTrail(
        existingIndex >= 0
          ? folderTrail.slice(0, existingIndex + 1)
          : [
              ...folderTrail,
              {
                folderNodeId: nextFolderNodeId,
                fullPath: nextFolderPath,
                name: folderNameByPath.get(nextFolderPath) ?? folderNameFromPath(nextFolderPath)
              }
            ]
      );
    },
    [changeFolderTrail, folderNameByPath, folderNodeIdByPath, folderTrail]
  );

  const openFolderAtLevel = useCallback(
    (levelIndex: number, folder: { folderNodeId: string; name: string }) => {
      const levelEntry = folderTrail[levelIndex];
      if (!levelEntry) {
        return;
      }

      changeFolderTrail([
        ...folderTrail.slice(0, levelIndex + 1),
        {
          folderNodeId: folder.folderNodeId,
          fullPath: buildPathInFolder(levelEntry.fullPath, folder.name),
          name: folder.name
        }
      ]);
    },
    [changeFolderTrail, folderTrail]
  );

  const openAncestorFile = useCallback(
    (levelIndex: number, file: FileRecord) => {
      changeFolderTrail(folderTrail.slice(0, levelIndex + 1), file);
    },
    [changeFolderTrail, folderTrail]
  );

  const onSelectCrumb = useCallback(
    (index: number) => {
      changeFolderTrail(folderTrail.slice(0, index + 1));
    },
    [changeFolderTrail, folderTrail]
  );

  const moveFilesDestinationOptions = useMemo(
    () =>
      Array.from(discoveredFoldersByNodeId.values())
        .slice()
        .sort((left, right) => left.fullPath.localeCompare(right.fullPath))
        .map((folder) => ({
          path: folder.fullPath,
          label: folder.fullPath === '/' ? dockspaceName : folder.fullPath
        })),
    [discoveredFoldersByNodeId, dockspaceName]
  );

  const moveFolderDestinationOptions = useMemo(() => {
    if (!moveFolderDialogSourcePath) {
      return [];
    }

    return Array.from(discoveredFoldersByNodeId.values())
      .slice()
      .sort((left, right) => left.fullPath.localeCompare(right.fullPath))
      .filter((folder) => !isSameOrDescendantPath(folder.fullPath, moveFolderDialogSourcePath))
      .map((folder) => ({
        path: folder.fullPath,
        label: folder.fullPath === '/' ? dockspaceName : folder.fullPath
      }));
  }, [discoveredFoldersByNodeId, dockspaceName, moveFolderDialogSourcePath]);

  // Discover the open trail and the current folder's subfolders, so the Move dialogs can offer
  // them as destinations and folder rows can show their file counts.
  useEffect(() => {
    const candidateNodeIds = folderTrail
      .map((entry) => entry.folderNodeId)
      .concat(folders.map((folder) => folder.folderNodeId));

    for (const folderNodeId of candidateNodeIds) {
      const node = discoveredFoldersByNodeId.get(folderNodeId);
      if (!node || loadingFolderNodeIds.has(folderNodeId)) {
        continue;
      }

      if (node.childFolderNodeIds === null || node.directFileCount === null) {
        void discoverFolderChildren(folderNodeId);
      }
    }
  }, [discoverFolderChildren, discoveredFoldersByNodeId, folderTrail, folders, loadingFolderNodeIds]);

  const folderFileCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of discoveredFoldersByNodeId.values()) {
      if (node.directFileCount !== null) {
        counts.set(node.fullPath, node.directFileCount);
      }
    }

    return counts;
  }, [discoveredFoldersByNodeId]);

  const onMoveToTrash = useCallback(
    (fullPath: string) => {
      void moveToTrash.mutateAsync({ fullPath, targetType: 'file' });
    },
    [moveToTrash]
  );

  const toggleFileSelection = useCallback((fullPath: string) => {
    setMoveFilesSummary(null);
    setSelectedFilePaths((previous) =>
      previous.includes(fullPath)
        ? previous.filter((selectedPath) => selectedPath !== fullPath)
        : previous.concat(fullPath)
    );
  }, []);

  const cancelSelectionMode = useCallback(() => {
    setSelectedFilePaths([]);
    setMoveFilesSummary(null);
    setMoveFilesDialogError(null);
    setIsMoveFilesDialogOpen(false);
  }, []);

  const openMoveFilesDialog = useCallback(() => {
    if (!selectedFilePaths.length) {
      return;
    }

    setMoveFilesDialogDestinationPath(currentFolder.fullPath);
    setMoveFilesDialogError(null);
    setIsMoveFilesDialogOpen(true);
  }, [currentFolder.fullPath, selectedFilePaths.length]);

  const closeMoveFilesDialog = useCallback(() => {
    if (moveFiles.isPending) {
      return;
    }

    setIsMoveFilesDialogOpen(false);
    setMoveFilesDialogError(null);
  }, [moveFiles.isPending]);

  const openMoveFolderDialog = useCallback((folderPath: string) => {
    setMoveFilesSummary(null);
    setMoveFolderDialogSourcePath(folderPath);
    setMoveFolderDialogDestinationPath(parentFolderPathFromPath(folderPath));
    setMoveFolderDialogError(null);
    setIsMoveFolderDialogOpen(true);
  }, []);

  const closeMoveFolderDialog = useCallback(() => {
    if (moveFolder.isPending) {
      return;
    }

    setIsMoveFolderDialogOpen(false);
    setMoveFolderDialogSourcePath(null);
    setMoveFolderDialogError(null);
  }, [moveFolder.isPending]);

  const onMoveFilesSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!selectedFilePaths.length) {
        return;
      }

      setMoveFilesDialogError(null);
      void (async () => {
        try {
          const response = await moveFiles.mutateAsync({
            sourcePaths: selectedFilePaths,
            targetFolderPath: moveFilesDialogDestinationPath
          });

          const movedCount = response.moved.length;
          const failedCount = response.failed.length;
          setMoveFilesSummary(
            failedCount
              ? `${movedCount} moved, ${failedCount} failed.`
              : `${movedCount} file${movedCount === 1 ? '' : 's'} moved.`
          );

          if (!failedCount) {
            setSelectedFilePaths([]);
            setIsMoveFilesDialogOpen(false);
            return;
          }

          setSelectedFilePaths(response.failed.map((entry) => entry.from));
          setMoveFilesDialogError(
            failedCount === 1
              ? response.failed[0]?.error ?? 'Failed to move selected file.'
              : `${failedCount} files failed to move.`
          );
        } catch (error) {
          setMoveFilesDialogError(
            error instanceof Error ? error.message : 'Failed to move selected files.'
          );
        }
      })();
    },
    [moveFiles, moveFilesDialogDestinationPath, selectedFilePaths]
  );

  const onMoveFolderSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!moveFolderDialogSourcePath) {
        return;
      }

      const sourceFolderPath = moveFolderDialogSourcePath;
      const targetFolderPath = moveFolderDialogDestinationPath;
      const sourceFolderNodeId = folderNodeIdByPath.get(sourceFolderPath) ?? null;
      const targetParentFolderNodeId = folderNodeIdByPath.get(targetFolderPath) ?? ROOT_FOLDER.folderNodeId;
      setMoveFolderDialogError(null);

      void (async () => {
        try {
          const response = await moveFolder.mutateAsync({
            sourceFolderPath,
            targetFolderPath
          });

          const wasMoved = response.status === 'MOVED';
          if (wasMoved) {
            setFolderTrail((previous) =>
              previous.map((entry) => {
                const remappedFullPath = remapPathAfterFolderMove(
                  entry.fullPath,
                  sourceFolderPath,
                  targetFolderPath
                );
                return {
                  ...entry,
                  fullPath: remappedFullPath,
                  name: remappedFullPath === '/' ? entry.name : folderNameFromPath(remappedFullPath)
                };
              })
            );

            setDiscoveredFoldersByNodeId((previous) => {
              const next = new Map(previous);
              for (const [folderNodeId, node] of next.entries()) {
                const remappedFullPath = remapPathAfterFolderMove(
                  node.fullPath,
                  sourceFolderPath,
                  targetFolderPath
                );
                next.set(folderNodeId, {
                  ...node,
                  fullPath: remappedFullPath,
                  parentFolderNodeId:
                    sourceFolderNodeId && folderNodeId === sourceFolderNodeId
                      ? targetParentFolderNodeId
                      : node.parentFolderNodeId
                });
              }

              return next;
            });
          }

          setMoveFilesSummary(
            wasMoved
              ? `Folder moved from ${response.from} to ${response.to}.`
              : 'Folder is already in the selected destination.'
          );
          setIsMoveFolderDialogOpen(false);
          setMoveFolderDialogSourcePath(null);
          setMoveFolderDialogError(null);
        } catch (error) {
          setMoveFolderDialogError(
            error instanceof Error ? error.message : 'Failed to move folder.'
          );
        }
      })();
    },
    [folderNodeIdByPath, moveFolder, moveFolderDialogDestinationPath, moveFolderDialogSourcePath]
  );

  const openTrashFolderDialog = useCallback((folderPath: string) => {
    setTrashFolderDialogPath(folderPath);
    setTrashFolderDialogError(null);
  }, []);

  const closeTrashFolderDialog = useCallback(() => {
    if (isTrashingFolder) {
      return;
    }

    setTrashFolderDialogPath(null);
    setTrashFolderDialogError(null);
  }, [isTrashingFolder]);

  const onTrashFolderSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!trashFolderDialogPath) {
        return;
      }

      const folderPath = trashFolderDialogPath;
      setTrashFolderDialogError(null);
      setIsTrashingFolder(true);
      setPendingFolderTrashPaths((previous) =>
        previous.includes(folderPath) ? previous : previous.concat(folderPath)
      );

      void (async () => {
        try {
          await moveToTrash.mutateAsync({ fullPath: folderPath, targetType: 'folder' });
          setTrashFolderDialogPath(null);
        } catch (error) {
          setTrashFolderDialogError(
            error instanceof Error ? error.message : 'Failed to move folder to trash.'
          );
        } finally {
          setPendingFolderTrashPaths((previous) =>
            previous.filter((pendingPath) => pendingPath !== folderPath)
          );
          setIsTrashingFolder(false);
        }
      })();
    },
    [moveToTrash, trashFolderDialogPath]
  );

  // The preview only ever shows a file of the open folder. When the file is renamed, moved or
  // trashed (or the folder's data no longer has it), the preview closes.
  const visiblePreviewFile = useMemo(
    () =>
      previewFile
        ? (files.find((file) => file.fullPath === previewFile.fullPath) ?? null)
        : null,
    [files, previewFile]
  );

  useEffect(() => {
    if (previewFile && filesQuery.data && !visiblePreviewFile) {
      setPreviewFile(null);
    }
  }, [filesQuery.data, previewFile, visiblePreviewFile]);

  const openFilePreview = useCallback(
    (file: FileRecord) => {
      if (isPhone && !previewFile) {
        phoneListScrollYRef.current = window.scrollY;
      }

      setPreviewFile(file);
    },
    [isPhone, previewFile]
  );

  const closePreview = useCallback(() => {
    focusFileRowAfterCloseRef.current = previewFile?.fullPath ?? null;
    setPreviewFile(null);
  }, [previewFile]);

  useEffect(() => {
    if (previewFile) {
      return;
    }

    const fullPath = focusFileRowAfterCloseRef.current;
    focusFileRowAfterCloseRef.current = null;
    if (!fullPath) {
      return;
    }

    if (isPhone) {
      window.scrollTo(0, phoneListScrollYRef.current);
    }

    const row = Array.from(document.querySelectorAll<HTMLElement>('[data-file-path]')).find(
      (element) => element.dataset.filePath === fullPath
    );
    row?.focus({ preventScroll: isPhone });
  }, [isPhone, previewFile]);

  useEffect(() => {
    if (!visiblePreviewFile) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }

      // Open dialogs and dropdown menus consume Escape first.
      if (document.querySelector('dialog[open], [role="menu"]')) {
        return;
      }

      event.preventDefault();
      closePreview();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closePreview, visiblePreviewFile]);

  const hasSidePreview = !isPhone && Boolean(visiblePreviewFile);

  // Keep the current (last) column fully visible: when the trail changes, when the side preview
  // opens or closes, and whenever the strip itself is resized (window resize, preview width).
  useEffect(() => {
    const strip = columnsRef.current;
    if (!strip) {
      return;
    }

    const scrollCurrentColumnIntoView = () => {
      strip.scrollLeft = strip.scrollWidth;
    };

    scrollCurrentColumnIntoView();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(scrollCurrentColumnIntoView);
    observer.observe(strip);
    return () => {
      observer.disconnect();
    };
  }, [folderTrail, hasSidePreview, isPhone]);

  const onDownloadFile = useCallback(
    (file: FileRecord) => {
      const fileNodeId = file.fileNodeId;
      if (!fileNodeId) {
        return;
      }

      void (async () => {
        try {
          const session = await createFileDownloadSession(dockspaceId, fileNodeId, {
            disposition: 'attachment'
          });
          const link = document.createElement('a');
          link.href = session.downloadUrl;
          document.body.appendChild(link);
          link.click();
          link.remove();
        } catch {
          // Errors are intentionally silent in this action-only flow.
        }
      })();
    },
    [dockspaceId]
  );

  const onDownloadFolder = useCallback(
    (folderPath: string) => {
      void (async () => {
        try {
          const session = await createFolderDownloadSession(dockspaceId, folderPath);
          if (!session.downloadUrl) {
            return;
          }

          const link = document.createElement('a');
          link.href = session.downloadUrl;
          document.body.appendChild(link);
          link.click();
          link.remove();
        } catch {
          // Errors are intentionally silent in this action-only flow.
        }
      })();
    },
    [dockspaceId]
  );

  const openRenameFileDialog = useCallback((fullPath: string) => {
    setRenameFileDialogFullPath(fullPath);
    setRenameFileDialogFileName(fileNameFromPath(fullPath));
    setRenameFileDialogValidationError(null);
  }, []);

  const closeRenameFileDialog = useCallback(() => {
    if (renameFile.isPending) {
      return;
    }

    setRenameFileDialogFullPath(null);
    setRenameFileDialogFileName('');
    setRenameFileDialogValidationError(null);
  }, [renameFile.isPending]);

  const onRenameFileSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!renameFileDialogFullPath) {
        return;
      }

      const newName = renameFileDialogFileName.trim();
      if (!newName) {
        setRenameFileDialogValidationError('File name cannot be empty.');
        return;
      }

      setRenameFileDialogValidationError(null);
      void (async () => {
        try {
          await renameFile.mutateAsync({ fullPath: renameFileDialogFullPath, newName });
          setRenameFileDialogFullPath(null);
          setRenameFileDialogFileName('');
        } catch {
          // Error is surfaced through renameFile.error.
        }
      })();
    },
    [renameFileDialogFileName, renameFileDialogFullPath, renameFile]
  );

  const openRenameFolderDialog = useCallback((folderPath: string) => {
    setRenameFolderDialogPath(folderPath);
    setRenameFolderDialogName(folderNameFromPath(folderPath));
    setRenameFolderDialogValidationError(null);
  }, []);

  const closeRenameFolderDialog = useCallback(() => {
    if (renameFolder.isPending) {
      return;
    }

    setRenameFolderDialogPath(null);
    setRenameFolderDialogName('');
    setRenameFolderDialogValidationError(null);
  }, [renameFolder.isPending]);

  const onRenameFolderSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!renameFolderDialogPath) {
        return;
      }

      const newName = renameFolderDialogName.trim();
      if (!newName) {
        setRenameFolderDialogValidationError('Folder name cannot be empty.');
        return;
      }

      const targetParentPath = parentFolderPathFromPath(renameFolderDialogPath);
      const normalizedTargetName = normalizeNodeName(newName);
      const hasSiblingConflict = folders.some((folder) => {
        if (folder.fullPath === renameFolderDialogPath) {
          return false;
        }

        if (parentFolderPathFromPath(folder.fullPath) !== targetParentPath) {
          return false;
        }

        return normalizeNodeName(folder.name) === normalizedTargetName;
      });

      if (hasSiblingConflict) {
        setRenameFolderDialogValidationError(FOLDER_RENAME_CONFLICT_MESSAGE);
        return;
      }

      setRenameFolderDialogValidationError(null);
      void (async () => {
        try {
          await renameFolder.mutateAsync({ folderPath: renameFolderDialogPath, newName });
          setRenameFolderDialogPath(null);
          setRenameFolderDialogName('');
        } catch (error) {
          if (error instanceof ApiError && error.statusCode === 409) {
            setRenameFolderDialogValidationError(FOLDER_RENAME_CONFLICT_MESSAGE);
          }
        }
      })();
    },
    [folders, renameFolder, renameFolderDialogName, renameFolderDialogPath]
  );

  const renameFileDialogErrorMessage =
    renameFileDialogValidationError ??
    (renameFile.error instanceof Error ? renameFile.error.message : null);
  const renameFolderDialogErrorMessage =
    renameFolderDialogValidationError ??
    (renameFolder.error instanceof Error ? renameFolder.error.message : null);

  const uploadErrorMessage =
    uploadDialog.validationError ??
    (uploadFile.error instanceof ApiError && uploadFile.error.code === 'UPLOAD_SKIPPED_DUPLICATE'
      ? null
      : uploadFile.error instanceof Error
        ? uploadFile.error.message
        : null);
  const pendingUploadFiles = useMemo(
    () =>
      uploadDialog.activeUploads
        .filter((upload) => upload.status === 'pending' || upload.status === 'uploading')
        .map((upload) => ({
          fullPath: upload.fullPath,
          progress: upload.progress,
          status: upload.status === 'pending' ? ('pending' as const) : ('uploading' as const)
        })),
    [uploadDialog.activeUploads]
  );
  const pendingUploadFolderPaths = useMemo(() => {
    const folderPaths = new Set<string>();

    for (const upload of uploadDialog.activeUploads) {
      if (upload.status === 'failed') {
        continue;
      }

      const segments = upload.fullPath.split('/').filter(Boolean);
      if (segments.length <= 1) {
        continue;
      }

      let runningPath = '';
      for (let index = 0; index < segments.length - 1; index += 1) {
        runningPath += `/${segments[index]}`;
        folderPaths.add(runningPath);
      }
    }

    return Array.from(folderPaths);
  }, [uploadDialog.activeUploads]);

  const selectionActions =
    selectedFilePaths.length > 0 ? (
      <>
        <p className="dockspace-browser__selection-meta">
          {selectedFilePaths.length} file{selectedFilePaths.length === 1 ? '' : 's'} selected
        </p>
        <div className="dockspace-browser__selection-actions">
          {moveFilesSummary ? (
            <p className="dockspace-browser__selection-feedback" aria-live="polite">
              {moveFilesSummary}
            </p>
          ) : null}
          <Button type="button" onClick={openMoveFilesDialog}>
            Move
          </Button>
          <Button type="button" variant="secondary" onClick={cancelSelectionMode}>
            Cancel
          </Button>
        </div>
      </>
    ) : null;

  const emptyDockspaceState = (
    <div className="dockspace-browser-empty">
      <svg
        className="dockspace-browser-empty__image"
        viewBox="0 0 760 420"
        role="img"
        aria-label="Empty folder illustration"
      >
        <defs>
          <linearGradient id="dockspace-empty-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(114, 196, 255, 0.35)" />
            <stop offset="100%" stopColor="rgba(47, 121, 201, 0.15)" />
          </linearGradient>
          <linearGradient id="dockspace-empty-folder" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(228, 236, 247, 0.95)" />
            <stop offset="100%" stopColor="rgba(145, 161, 184, 0.92)" />
          </linearGradient>
        </defs>
        <rect x="24" y="16" width="712" height="388" rx="36" fill="url(#dockspace-empty-bg)" />
        <path
          d="M196 112h118l28 44h222c30 0 54 24 54 54v64c0 30-24 54-54 54H196c-30 0-54-24-54-54v-108c0-30 24-54 54-54z"
          fill="url(#dockspace-empty-folder)"
        />
        <path
          d="M380 182v72m0 0-28-28m28 28 28-28"
          stroke="rgba(24, 36, 54, 0.72)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="590" cy="120" r="22" fill="rgba(132, 220, 170, 0.82)" />
        <circle cx="624" cy="94" r="12" fill="rgba(126, 203, 255, 0.8)" />
      </svg>
      <p className="dockspace-browser-empty__title">This folder is empty</p>
      <p className="dockspace-browser-empty__message">
        Upload your first files to start organizing your dockspace.
      </p>
      <Button type="button" onClick={openFilePicker}>
        Upload your first files
      </Button>
    </div>
  );

  const filesErrorAlert =
    filesQuery.error && !unauthorized ? (
      <Alert
        message={filesQuery.error instanceof Error ? filesQuery.error.message : 'Unable to load folder.'}
      />
    ) : null;

  const fileList = (
    <FileList
      files={files}
      folders={folders}
      currentFolder={currentFolder.fullPath}
      columnTitle={isPhone ? undefined : folderLabel(currentFolder)}
      folderFileCounts={folderFileCounts}
      previewedFilePath={visiblePreviewFile?.fullPath ?? null}
      pendingFolderPaths={addFolderDialog.pendingFolderPaths}
      pendingFolderTrashPaths={pendingFolderTrashPaths}
      pendingUploadFiles={pendingUploadFiles}
      pendingUploadFolderPaths={pendingUploadFolderPaths}
      selectedFilePaths={selectedFilePaths}
      selectionActions={selectionActions}
      statusMessage={moveFilesSummary}
      actionLabel="Move to Trash"
      downloadActionLabel="Download"
      folderDownloadActionLabel="Download"
      renameActionLabel="Rename"
      folderMoveActionLabel="Move"
      folderRenameActionLabel="Rename"
      emptyState={filesQuery.isLoading ? <p>Loading...</p> : emptyDockspaceState}
      onRename={openRenameFileDialog}
      onRenameFolder={openRenameFolderDialog}
      onMoveFolder={openMoveFolderDialog}
      onOpenFile={openFilePreview}
      onDownload={onDownloadFile}
      onDownloadFolder={onDownloadFolder}
      onOpenFolder={onOpenFolder}
      onToggleFileSelection={toggleFileSelection}
      onActionFolder={openTrashFolderDialog}
      onAction={onMoveToTrash}
    />
  );

  const crumbs = folderTrail.map((entry) => ({ key: entry.folderNodeId, label: folderLabel(entry) }));
  const locationLabel = crumbs.map((crumb) => crumb.label).join(' / ');
  const currentFolderLabel = folderLabel(currentFolder);
  const uploadsCard = (
    <UploadsCard
      activeUploads={uploadDialog.activeUploads}
      skippedUploads={uploadDialog.skippedUploads}
      isPreparingFolders={uploadDialog.isPreparingFolders}
      uploadErrorMessage={uploadErrorMessage}
      defaultCollapsed={isPhone}
      onDismissSkippedUploads={uploadDialog.clearSkippedUploads}
      onRetryUpload={uploadDialog.retryUpload}
    />
  );

  const phoneLayout = (
    <div className="dockspace-files dockspace-files--phone">
      {visiblePreviewFile ? (
        <FilePreviewPanel
          dockspaceId={dockspaceId}
          file={visiblePreviewFile}
          locationLabel={locationLabel}
          variant="page"
          backLabel={`Back to ${currentFolderLabel}`}
          onClose={closePreview}
          onDownload={onDownloadFile}
        />
      ) : (
        <>
          {parentFolder ? (
            <FolderBreadcrumb crumbs={crumbs} variant="compact" onSelectCrumb={onSelectCrumb} />
          ) : null}
          <div className="dockspace-phone-header">
            {parentFolder ? (
              <button
                type="button"
                className="dockspace-icon-button dockspace-icon-button--ghost"
                aria-label={`Back to ${folderLabel(parentFolder)}`}
                onClick={() => onSelectCrumb(folderTrail.length - 2)}
              >
                <ArrowLeft size={18} aria-hidden="true" />
              </button>
            ) : null}
            <h1 className="dockspace-phone-header__title">{currentFolderLabel}</h1>
            <DockspaceOptionsMenu
              dockspaceId={dockspaceId}
              variant="phone"
              onAddFolder={addFolderDialog.openDialog}
              onUploadFiles={openFilePicker}
              onUploadFolder={openFolderPicker}
            />
          </div>
          {parentFolder ? (
            <ParentFolderChips
              dockspaceId={dockspaceId}
              parentEntry={parentFolder}
              parentLabel={folderLabel(parentFolder)}
              currentFolderNodeId={currentFolder.folderNodeId}
              onOpenFolder={(folder) => openFolderAtLevel(folderTrail.length - 2, folder)}
            />
          ) : null}
          <section className="dockspace-column dockspace-column--current" aria-label={currentFolderLabel}>
            {filesErrorAlert}
            {fileList}
          </section>
          <div className="dockspace-files__floating">
            {uploadsCard}
            <UploadMenu variant="floating" onUploadFiles={openFilePicker} onUploadFolder={openFolderPicker} />
          </div>
        </>
      )}
    </div>
  );

  const desktopLayout = (
    <div className="dockspace-files">
      {/* The page's one h1; the breadcrumb and column headers already show the folder name visibly. */}
      <h1 className="visually-hidden">{currentFolderLabel}</h1>
      <div className="dockspace-folder-bar">
        <FolderBreadcrumb crumbs={crumbs} onSelectCrumb={onSelectCrumb} />
        <DockspaceFilesHeaderActions
          dockspaceId={dockspaceId}
          onAddFolder={addFolderDialog.openDialog}
          onUploadFiles={openFilePicker}
          onUploadFolder={openFolderPicker}
        />
      </div>
      <div className="dockspace-work">
        <div ref={columnsRef} className="dockspace-columns" role="group" aria-label="Folder columns">
          {folderTrail.slice(0, -1).map((entry, levelIndex) => (
            <AncestorColumn
              key={entry.folderNodeId}
              dockspaceId={dockspaceId}
              entry={entry}
              title={folderLabel(entry)}
              openChildFolderNodeId={folderTrail[levelIndex + 1]?.folderNodeId ?? null}
              isOlderAncestor={levelIndex < folderTrail.length - 2}
              onOpenFolder={(folder) => openFolderAtLevel(levelIndex, folder)}
              onOpenFile={(file) => openAncestorFile(levelIndex, file)}
            />
          ))}
          <section className="dockspace-column dockspace-column--current" aria-label={currentFolderLabel}>
            {filesErrorAlert}
            {fileList}
          </section>
        </div>
        {visiblePreviewFile ? (
          <FilePreviewPanel
            dockspaceId={dockspaceId}
            file={visiblePreviewFile}
            locationLabel={locationLabel}
            variant="side"
            onClose={closePreview}
            onDownload={onDownloadFile}
          />
        ) : null}
      </div>
      <div className="dockspace-files__floating">{uploadsCard}</div>
    </div>
  );

  return (
    <RequireAuth>
      <Page className="page--dockspace">
        {unauthorized ? (
          <UnauthorizedNotice />
        ) : (
          <>
            <input
              ref={fileInputRef}
              className="dockspace-files__hidden-input"
              type="file"
              multiple
              onChange={onUploadSelection}
            />
            <input
              ref={folderInputRef}
              className="dockspace-files__hidden-input"
              type="file"
              {...({ webkitdirectory: '' } as Record<string, string>)}
              onChange={onUploadFolderSelection}
            />
            {isPhone ? phoneLayout : desktopLayout}
            <AddFolderDialog
              errorMessage={addFolderDialog.errorMessage}
              folderName={addFolderDialog.folderName}
              isOpen={addFolderDialog.isDialogOpen}
              isSubmitting={createFolder.isPending}
              onClose={addFolderDialog.closeDialog}
              onFolderNameChange={addFolderDialog.onFolderNameChange}
              onSubmit={addFolderDialog.onSubmit}
            />
            <RenameFileDialog
              errorMessage={renameFileDialogErrorMessage}
              fileName={renameFileDialogFileName}
              isOpen={Boolean(renameFileDialogFullPath)}
              isSubmitting={renameFile.isPending}
              onClose={closeRenameFileDialog}
              onFileNameChange={(nextValue) => {
                setRenameFileDialogFileName(nextValue);
                if (renameFileDialogValidationError) {
                  setRenameFileDialogValidationError(null);
                }
              }}
              onSubmit={onRenameFileSubmit}
            />
            <RenameFolderDialog
              errorMessage={renameFolderDialogErrorMessage}
              folderName={renameFolderDialogName}
              isOpen={Boolean(renameFolderDialogPath)}
              isSubmitting={renameFolder.isPending}
              onClose={closeRenameFolderDialog}
              onFolderNameChange={(nextValue) => {
                setRenameFolderDialogName(nextValue);
                if (renameFolderDialogValidationError) {
                  setRenameFolderDialogValidationError(null);
                }
              }}
              onSubmit={onRenameFolderSubmit}
            />
            <ConfirmFolderTrashDialog
              errorMessage={trashFolderDialogError}
              folderPath={trashFolderDialogPath}
              isOpen={Boolean(trashFolderDialogPath)}
              isSubmitting={isTrashingFolder}
              onClose={closeTrashFolderDialog}
              onSubmit={onTrashFolderSubmit}
            />
            <MoveFilesDialog
              destinationFolderPath={moveFilesDialogDestinationPath}
              destinationOptions={moveFilesDestinationOptions}
              errorMessage={moveFilesDialogError}
              isOpen={isMoveFilesDialogOpen}
              isSubmitting={moveFiles.isPending}
              selectedFileCount={selectedFilePaths.length}
              onClose={closeMoveFilesDialog}
              onDestinationFolderPathChange={(nextValue) => {
                setMoveFilesDialogDestinationPath(nextValue);
                if (moveFilesDialogError) {
                  setMoveFilesDialogError(null);
                }
              }}
              onSubmit={onMoveFilesSubmit}
            />
            <MoveFolderDialog
              sourceFolderPath={moveFolderDialogSourcePath}
              destinationFolderPath={moveFolderDialogDestinationPath}
              destinationOptions={moveFolderDestinationOptions}
              errorMessage={moveFolderDialogError}
              isOpen={isMoveFolderDialogOpen}
              isSubmitting={moveFolder.isPending}
              onClose={closeMoveFolderDialog}
              onDestinationFolderPathChange={(nextValue) => {
                setMoveFolderDialogDestinationPath(nextValue);
                if (moveFolderDialogError) {
                  setMoveFolderDialogError(null);
                }
              }}
              onSubmit={onMoveFolderSubmit}
            />
          </>
        )}
      </Page>
    </RequireAuth>
  );
};
