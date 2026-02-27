import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MediaFileRecord } from '@/lib/apiTypes';
import type { MediaSelectionOptions } from '@/pages/dockspaceMedia/mediaTypes';

interface UseMediaSelectionStateParams {
  mediaItems: MediaFileRecord[];
  mediaById: Map<string, MediaFileRecord>;
}

export const useMediaSelectionState = ({ mediaItems, mediaById }: UseMediaSelectionStateParams) => {
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [lastMultiSelectAnchorId, setLastMultiSelectAnchorId] = useState<string | null>(null);
  const selectedMediaIdSet = useMemo(() => new Set(selectedMediaIds), [selectedMediaIds]);

  useEffect(() => {
    setSelectedMediaIds((previous) => {
      const next = previous.filter((fileNodeId) => mediaById.has(fileNodeId));
      if (
        next.length === previous.length &&
        next.every((fileNodeId, index) => fileNodeId === previous[index])
      ) {
        return previous;
      }

      return next;
    });
  }, [mediaById]);

  useEffect(() => {
    if (lastMultiSelectAnchorId && !mediaById.has(lastMultiSelectAnchorId)) {
      setLastMultiSelectAnchorId(null);
    }
  }, [lastMultiSelectAnchorId, mediaById]);

  const clearSelection = useCallback(() => {
    setSelectedMediaIds([]);
    setLastMultiSelectAnchorId(null);
  }, []);

  const resetAnchor = useCallback(() => {
    setLastMultiSelectAnchorId(null);
  }, []);

  const onToggleMediaSelection = useCallback(
    (fileNodeId: string, options?: MediaSelectionOptions) => {
      const shiftKey = Boolean(options?.shiftKey);
      const currentlySelected = selectedMediaIdSet.has(fileNodeId);
      const clickedIndex =
        typeof options?.itemIndex === 'number'
          ? options.itemIndex
          : mediaItems.findIndex((item) => item.fileNodeId === fileNodeId);

      setSelectedMediaIds((previous) => {
        if (shiftKey && lastMultiSelectAnchorId) {
          const anchorIndex = mediaItems.findIndex(
            (item) => item.fileNodeId === lastMultiSelectAnchorId
          );

          if (anchorIndex !== -1 && clickedIndex !== -1) {
            const start = Math.min(anchorIndex, clickedIndex);
            const end = Math.max(anchorIndex, clickedIndex);
            const rangeIds = mediaItems.slice(start, end + 1).map((item) => item.fileNodeId);
            return Array.from(new Set([...previous, ...rangeIds]));
          }
        }

        return previous.includes(fileNodeId)
          ? previous.filter((selectedId) => selectedId !== fileNodeId)
          : [...previous, fileNodeId];
      });

      if (shiftKey || !currentlySelected) {
        setLastMultiSelectAnchorId(fileNodeId);
      }
    },
    [lastMultiSelectAnchorId, mediaItems, selectedMediaIdSet]
  );

  return {
    selectedMediaIds,
    setSelectedMediaIds,
    selectedMediaIdSet,
    clearSelection,
    resetAnchor,
    onToggleMediaSelection
  };
};
