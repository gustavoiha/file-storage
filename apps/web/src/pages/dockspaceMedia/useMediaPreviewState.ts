import { useCallback, useState } from 'react';
import type { FileRecord, MediaFileRecord } from '@/lib/apiTypes';

export const useMediaPreviewState = () => {
  const [viewerFile, setViewerFile] = useState<FileRecord | null>(null);
  const [viewerThumbnailUrl, setViewerThumbnailUrl] = useState<string | null>(null);

  const openPreview = useCallback((item: MediaFileRecord) => {
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

  const closePreview = useCallback(() => {
    setViewerFile(null);
    setViewerThumbnailUrl(null);
  }, []);

  return {
    viewerFile,
    viewerThumbnailUrl,
    openPreview,
    closePreview,
    clearPreview: closePreview
  };
};
