import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { ActiveUploadFile, SkippedUploadFile } from '@/hooks/useDockspaceUploadDialog';
import { pluralize } from '@/lib/fileFormat';

interface UploadsCardProps {
  activeUploads: ActiveUploadFile[];
  skippedUploads: SkippedUploadFile[];
  isPreparingFolders: boolean;
  uploadErrorMessage: string | null;
  /**
   * A message about files that were left out on purpose (for example non-media files picked in the gallery). Shown
   * where the error goes, but as a neutral notice: it does not count as a failed upload in the collapsed pill.
   */
  uploadNoticeMessage?: string | null;
  /** Start collapsed (phone). Re-applied whenever the value changes. */
  defaultCollapsed?: boolean;
  onDismissSkippedUploads: () => void;
  onRetryUpload: (uploadId: number) => void;
}

const UploadRow = ({
  upload,
  onRetryUpload
}: {
  upload: ActiveUploadFile;
  onRetryUpload: (uploadId: number) => void;
}) => (
  <li className="dockspace-uploads__row">
    <div className="dockspace-uploads__line">
      <span className="dockspace-uploads__path" title={upload.fullPath}>
        {upload.fullPath}
      </span>
      {upload.status === 'pending' ? (
        <span className="dockspace-uploads__status">Waiting</span>
      ) : upload.status === 'uploading' ? (
        <span className="dockspace-uploads__status">{upload.progress}%</span>
      ) : (
        <span className="dockspace-uploads__status dockspace-uploads__status--failed">
          <span title={upload.errorMessage ?? undefined}>Failed</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => onRetryUpload(upload.id)}>
            Retry
          </Button>
        </span>
      )}
    </div>
    {upload.status === 'uploading' ? (
      <div
        className="dockspace-uploads__bar"
        role="progressbar"
        aria-label={`Uploading ${upload.fullPath}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={upload.progress}
      >
        <span style={{ width: `${upload.progress}%` }} />
      </div>
    ) : null}
  </li>
);

export const summarizeUploads = (activeUploads: ActiveUploadFile[], isPreparingFolders: boolean): string => {
  const total = activeUploads.length;
  if (!total) {
    return isPreparingFolders ? 'Creating folders…' : 'Uploads';
  }

  const started = activeUploads.filter((upload) => upload.status !== 'pending').length;
  const overallProgress = Math.round(
    activeUploads.reduce((sum, upload) => sum + (upload.status === 'pending' ? 0 : upload.progress), 0) / total
  );
  const inFlight = activeUploads.some((upload) => upload.status !== 'failed');

  if (!inFlight) {
    return `${pluralize(total, 'upload')} failed`;
  }

  return `Uploading ${Math.max(started, 1)} of ${total} · ${overallProgress}%`;
};

export const UploadsCard = ({
  activeUploads,
  skippedUploads,
  isPreparingFolders,
  uploadErrorMessage,
  uploadNoticeMessage = null,
  defaultCollapsed = false,
  onDismissSkippedUploads,
  onRetryUpload
}: UploadsCardProps) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isSkippedExpanded, setIsSkippedExpanded] = useState(false);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  // Collapse and the pill each unmount themselves when pressed. The one that replaces it takes focus after the render,
  // so focus does not fall to <body>. Only a press sets this: a change of defaultCollapsed does not move focus.
  const focusAfterToggleRef = useRef(false);
  const toggleCollapsed = (collapsed: boolean) => {
    focusAfterToggleRef.current = true;
    setIsCollapsed(collapsed);
  };
  // Retry turns the failed row back into a waiting one, which removes the focused Retry button: focus moves to the
  // card's Collapse button first instead of falling to <body>.
  const retryUpload = (uploadId: number) => {
    collapseButtonRef.current?.focus();
    onRetryUpload(uploadId);
  };

  useEffect(() => {
    setIsCollapsed(defaultCollapsed);
  }, [defaultCollapsed]);

  useEffect(() => {
    if (!focusAfterToggleRef.current) {
      return;
    }
    focusAfterToggleRef.current = false;
    (isCollapsed ? pillRef : collapseButtonRef).current?.focus();
  }, [isCollapsed]);

  const hasContent =
    activeUploads.length > 0 ||
    isPreparingFolders ||
    Boolean(uploadErrorMessage) ||
    Boolean(uploadNoticeMessage) ||
    skippedUploads.length > 0;

  if (!hasContent) {
    return null;
  }

  const hasFailure = activeUploads.some((upload) => upload.status === 'failed') || Boolean(uploadErrorMessage);
  const hasSkipped = Boolean(uploadNoticeMessage) || skippedUploads.length > 0;
  const summary = summarizeUploads(activeUploads, isPreparingFolders);
  const pillLabel = [
    `Expand uploads: ${summary}`,
    ...(hasFailure ? ['an upload failed'] : []),
    ...(hasSkipped ? ['files were skipped'] : [])
  ].join(', ');

  if (isCollapsed) {
    return (
      <section className="dockspace-uploads dockspace-uploads--collapsed" aria-label="Uploads" aria-live="polite">
        <button
          ref={pillRef}
          type="button"
          className="dockspace-uploads__pill"
          aria-expanded="false"
          aria-label={pillLabel}
          onClick={() => toggleCollapsed(false)}
        >
          <Upload size={14} aria-hidden="true" />
          <span>{summary}</span>
          {hasFailure ? <span className="dockspace-uploads__dot" aria-hidden="true" /> : null}
        </button>
      </section>
    );
  }

  return (
    <section className="dockspace-uploads" aria-label="Uploads" aria-live="polite">
      <header className="dockspace-uploads__head">
        <h2 className="dockspace-uploads__label">Uploads</h2>
        {activeUploads.length ? (
          <span className="dockspace-uploads__count">{activeUploads.length} active</span>
        ) : null}
        <button
          ref={collapseButtonRef}
          type="button"
          className="dockspace-icon-button dockspace-icon-button--ghost dockspace-uploads__toggle"
          aria-expanded="true"
          aria-label="Collapse uploads"
          onClick={() => toggleCollapsed(true)}
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </header>
      {isPreparingFolders ? <p className="dockspace-uploads__muted">Creating folders…</p> : null}
      {activeUploads.length ? (
        <ul className="dockspace-uploads__list">
          {activeUploads.map((upload) => (
            <UploadRow key={upload.id} upload={upload} onRetryUpload={retryUpload} />
          ))}
        </ul>
      ) : null}
      {uploadErrorMessage ? <p className="dockspace-uploads__error">{uploadErrorMessage}</p> : null}
      {uploadNoticeMessage ? <p className="dockspace-uploads__muted">{uploadNoticeMessage}</p> : null}
      {skippedUploads.length ? (
        <div className="dockspace-uploads__skipped">
          <div className="dockspace-uploads__line">
            <span className="dockspace-uploads__muted">
              {skippedUploads.length} file{skippedUploads.length === 1 ? '' : 's'} skipped as duplicate
              {skippedUploads.length === 1 ? '' : 's'} ·{' '}
              <button
                type="button"
                className="dockspace-link-button"
                aria-expanded={isSkippedExpanded}
                onClick={() => setIsSkippedExpanded((previous) => !previous)}
              >
                Details
              </button>
            </span>
            <button type="button" className="dockspace-link-button" onClick={onDismissSkippedUploads}>
              Dismiss
            </button>
          </div>
          {isSkippedExpanded ? (
            <ul className="dockspace-uploads__skipped-list">
              {skippedUploads.map((item) => (
                <li key={`${item.duplicateType}:${item.fullPath}`} title={item.reason}>
                  {item.fullPath}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
