import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MediaDuplicateGroupRecord } from '@/lib/apiTypes';
import type { DuplicateGroupSelection } from '@/pages/dockspaceMedia/mediaTypes';

interface UseDuplicateSelectionStateParams {
  duplicateGroups: MediaDuplicateGroupRecord[];
}

export const useDuplicateSelectionState = ({ duplicateGroups }: UseDuplicateSelectionStateParams) => {
  const [duplicateSelections, setDuplicateSelections] = useState<
    Record<string, DuplicateGroupSelection>
  >({});

  useEffect(() => {
    if (!duplicateGroups.length) {
      setDuplicateSelections({});
      return;
    }

    setDuplicateSelections((previous) => {
      const next: Record<string, DuplicateGroupSelection> = {};

      for (const group of duplicateGroups) {
        const fileNodeIds = group.items.map((item) => item.fileNodeId);
        const previousSelection = previous[group.contentHash];
        const keeperFileNodeId = fileNodeIds.includes(previousSelection?.keeperFileNodeId ?? '')
          ? (previousSelection?.keeperFileNodeId ?? group.defaultKeeperFileNodeId)
          : group.defaultKeeperFileNodeId;
        const defaultSelections = group.items
          .map((item) => item.fileNodeId)
          .filter((fileNodeId) => fileNodeId !== keeperFileNodeId);
        const selectedForTrashFileNodeIds = Array.from(
          new Set(
            (previousSelection?.selectedForTrashFileNodeIds ?? defaultSelections).filter(
              (fileNodeId) => fileNodeIds.includes(fileNodeId) && fileNodeId !== keeperFileNodeId
            )
          )
        );

        next[group.contentHash] = {
          keeperFileNodeId,
          selectedForTrashFileNodeIds
        };
      }

      return next;
    });
  }, [duplicateGroups]);

  const selectedDuplicatePaths = useMemo(() => {
    const pathByGroupAndFileNode = new Map<string, string>();
    for (const group of duplicateGroups) {
      for (const item of group.items) {
        pathByGroupAndFileNode.set(`${group.contentHash}#${item.fileNodeId}`, item.fullPath);
      }
    }

    const paths: string[] = [];
    for (const group of duplicateGroups) {
      const selection = duplicateSelections[group.contentHash];
      if (!selection) {
        continue;
      }

      for (const fileNodeId of selection.selectedForTrashFileNodeIds) {
        const fullPath = pathByGroupAndFileNode.get(`${group.contentHash}#${fileNodeId}`);
        if (fullPath) {
          paths.push(fullPath);
        }
      }
    }

    return Array.from(new Set(paths));
  }, [duplicateGroups, duplicateSelections]);

  const onSelectDuplicateKeeper = useCallback((contentHash: string, fileNodeId: string) => {
    setDuplicateSelections((previous) => {
      const current = previous[contentHash];
      if (!current) {
        return previous;
      }

      const nextSelectedForTrash = Array.from(
        new Set(current.selectedForTrashFileNodeIds.filter((candidate) => candidate !== fileNodeId))
      );
      if (current.keeperFileNodeId && current.keeperFileNodeId !== fileNodeId) {
        nextSelectedForTrash.push(current.keeperFileNodeId);
      }

      return {
        ...previous,
        [contentHash]: {
          keeperFileNodeId: fileNodeId,
          selectedForTrashFileNodeIds: Array.from(new Set(nextSelectedForTrash))
        }
      };
    });
  }, []);

  const onToggleDuplicateSelection = useCallback((contentHash: string, fileNodeId: string) => {
    setDuplicateSelections((previous) => {
      const current = previous[contentHash];
      if (!current || current.keeperFileNodeId === fileNodeId) {
        return previous;
      }

      const selectedSet = new Set(current.selectedForTrashFileNodeIds);
      if (selectedSet.has(fileNodeId)) {
        selectedSet.delete(fileNodeId);
      } else {
        selectedSet.add(fileNodeId);
      }

      return {
        ...previous,
        [contentHash]: {
          ...current,
          selectedForTrashFileNodeIds: Array.from(selectedSet)
        }
      };
    });
  }, []);

  return {
    duplicateSelections,
    selectedDuplicatePaths,
    onSelectDuplicateKeeper,
    onToggleDuplicateSelection
  };
};
