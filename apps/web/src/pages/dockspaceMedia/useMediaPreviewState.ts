import { useCallback, useState } from 'react';
import type { FileRecord, MediaFileRecord } from '@/lib/apiTypes';

export const useMediaPreviewState = () => {
  const [viewerFile, setViewerFile] = useState<FileRecord | null>(null);
  const [viewerThumbnailUrl, setViewerThumbnailUrl] = useState<string | null>(null);
  const [previewItems, setPreviewItems] = useState<MediaFileRecord[]>([]);
  const [previewIndex, setPreviewIndex] = useState(-1);

  const setPreviewFromItem = useCallback((item: MediaFileRecord) => {
    setViewerFile({
      fileNodeId: item.fileNodeId,
      fullPath: item.fullPath,
      size: item.size,
      contentType: item.contentType,
      updatedAt: item.updatedAt,
      state: item.state
    });
    setViewerThumbnailUrl(item.thumbnail?.url ?? null);
  }, []);

  const openPreview = useCallback(
    (item: MediaFileRecord, orderedItems: MediaFileRecord[]) => {
      const nextItems = orderedItems.length ? orderedItems : [item];
      const nextIndex = Math.max(
        0,
        nextItems.findIndex((candidate) => candidate.fileNodeId === item.fileNodeId)
      );
      setPreviewItems(nextItems);
      setPreviewIndex(nextIndex);
      setPreviewFromItem(nextItems[nextIndex] ?? item);
    },
    [setPreviewFromItem]
  );

  const openPreviousPreview = useCallback(() => {
    setPreviewIndex((currentIndex) => {
      if (currentIndex <= 0) {
        return currentIndex;
      }

      const nextIndex = currentIndex - 1;
      const nextItem = previewItems[nextIndex];
      if (nextItem) {
        setPreviewFromItem(nextItem);
      }
      return nextIndex;
    });
  }, [previewItems, setPreviewFromItem]);

  const openNextPreview = useCallback(() => {
    setPreviewIndex((currentIndex) => {
      if (currentIndex < 0 || currentIndex >= previewItems.length - 1) {
        return currentIndex;
      }

      const nextIndex = currentIndex + 1;
      const nextItem = previewItems[nextIndex];
      if (nextItem) {
        setPreviewFromItem(nextItem);
      }
      return nextIndex;
    });
  }, [previewItems, setPreviewFromItem]);

  const closePreview = useCallback(() => {
    setViewerFile(null);
    setViewerThumbnailUrl(null);
    setPreviewItems([]);
    setPreviewIndex(-1);
  }, []);

  return {
    viewerFile,
    viewerThumbnailUrl,
    canPreviewPrevious: previewIndex > 0,
    canPreviewNext: previewIndex >= 0 && previewIndex < previewItems.length - 1,
    openPreview,
    openPreviousPreview,
    openNextPreview,
    closePreview,
    clearPreview: closePreview
  };
};
