import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FilePreviewContent } from '@/components/files/FilePreviewContent';
import { useFileIconForPath } from '@/hooks/useFileIconForPath';
import type { FileRecord } from '@/lib/apiTypes';
import { createFileDownloadSession } from '@/lib/dockspaceApi';
import { describeFileType, formatFileSize, formatModifiedDate } from '@/lib/fileFormat';

interface FilePreviewPanelProps {
  dockspaceId: string;
  file: FileRecord;
  /** Human-readable folder path, e.g. "Personal Drive / Travel / Lisbon 2025". */
  locationLabel: string;
  /** `side` is the desktop column; `page` is the full-width phone view with a back button. */
  variant: 'side' | 'page';
  backLabel?: string;
  onClose: () => void;
  onDownload: (file: FileRecord) => void;
}

const basename = (fullPath: string): string => {
  const segments = fullPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? fullPath;
};

export const FilePreviewPanel = ({
  dockspaceId,
  file,
  locationLabel,
  variant,
  backLabel,
  onClose,
  onDownload
}: FilePreviewPanelProps) => {
  const fileName = basename(file.fullPath);
  const FileIcon = useFileIconForPath(file.fullPath);
  const fileNodeId = file.fileNodeId?.trim() ?? '';

  // Same query key as FilePreviewContent, so this shares its cached download session.
  const sessionQuery = useQuery({
    queryKey: ['file-download-session', dockspaceId, fileNodeId],
    queryFn: () => createFileDownloadSession(dockspaceId, fileNodeId),
    enabled: Boolean(dockspaceId && fileNodeId)
  });

  const size = formatFileSize(file.size ?? sessionQuery.data?.size);
  const type = describeFileType(file.contentType ?? sessionQuery.data?.contentType, fileName);
  const modified = formatModifiedDate(file.updatedAt);

  return (
    <aside className={`dockspace-preview dockspace-preview--${variant}`} aria-label="File preview">
      <header className="dockspace-preview__head">
        {variant === 'page' ? (
          <button
            type="button"
            className="dockspace-icon-button dockspace-icon-button--ghost"
            aria-label={backLabel ?? 'Back'}
            onClick={onClose}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
        ) : null}
        <FileIcon className="dockspace-preview__icon" size={16} strokeWidth={1.5} aria-hidden="true" />
        <h2 className="dockspace-preview__title" title={fileName}>
          {fileName}
        </h2>
        <Button type="button" variant="secondary" size="sm" onClick={() => onDownload(file)}>
          <Download size={14} aria-hidden="true" />
          Download
        </Button>
        {variant === 'side' ? (
          <button
            type="button"
            className="dockspace-icon-button dockspace-icon-button--ghost"
            aria-label="Close preview"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        ) : null}
      </header>
      <div className="dockspace-preview__body">
        <div className="dockspace-preview__stage">
          <FilePreviewContent dockspaceId={dockspaceId} file={file} />
        </div>
        <dl className="dockspace-preview__meta">
          {size ? (
            <>
              <dt>Size</dt>
              <dd>{size}</dd>
            </>
          ) : null}
          {type ? (
            <>
              <dt>Type</dt>
              <dd>{type}</dd>
            </>
          ) : null}
          {modified ? (
            <>
              <dt>Modified</dt>
              <dd>{modified}</dd>
            </>
          ) : null}
          <dt>Location</dt>
          <dd title={locationLabel}>{locationLabel}</dd>
        </dl>
        {variant === 'side' ? (
          <p className="dockspace-preview__hint">
            <kbd>Esc</kbd> closes the preview
          </p>
        ) : null}
      </div>
    </aside>
  );
};
