import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FilePreviewContent } from '@/components/files/FilePreviewContent';
import type { FileRecord } from '@/lib/apiTypes';

interface FileViewerDialogProps {
  file: FileRecord | null;
  isOpen: boolean;
  onClose: () => void;
  dockspaceId: string;
  thumbnailUrl?: string | null;
  variant?: 'default' | 'media-fullscreen';
  onPrevious?: () => void;
  onNext?: () => void;
  canPrevious?: boolean;
  canNext?: boolean;
}

const basename = (fullPath: string): string => {
  const segments = fullPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? fullPath;
};
export const FileViewerDialog = ({
  file,
  isOpen,
  onClose,
  dockspaceId,
  thumbnailUrl,
  variant = 'default',
  onPrevious,
  onNext,
  canPrevious = false,
  canNext = false
}: FileViewerDialogProps) => {
  const fileName = file ? basename(file.fullPath) : '';
  const isMediaFullscreen = variant === 'media-fullscreen';

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'ArrowLeft') {
        if (isMediaFullscreen && onPrevious && canPrevious) {
          event.preventDefault();
          onPrevious();
        }
        return;
      }

      if (event.key === 'ArrowRight') {
        if (isMediaFullscreen && onNext && canNext) {
          event.preventDefault();
          onNext();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [canNext, canPrevious, isMediaFullscreen, isOpen, onClose, onNext, onPrevious]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={
        isMediaFullscreen
          ? 'dockspace-dialog-backdrop dockspace-dialog-backdrop--viewer'
          : 'dockspace-dialog-backdrop'
      }
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <dialog
        className={
          isMediaFullscreen
            ? 'dockspace-dialog dockspace-dialog--viewer-fullscreen'
            : 'dockspace-dialog dockspace-dialog--viewer'
        }
        open
        aria-modal="true"
        aria-label={fileName ? `Preview ${fileName}` : 'File preview'}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
        onMouseDown={(event) => {
          if (isMediaFullscreen && event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        {isMediaFullscreen ? (
          <>
            <button
              type="button"
              className="dockspace-file-viewer__close-button"
              aria-label="Close preview"
              title="Close preview"
              onClick={onClose}
            >
              <X size={24} />
            </button>
            <button
              type="button"
              className="dockspace-file-viewer__nav-button dockspace-file-viewer__nav-button--left"
              aria-label="Previous media item"
              onClick={onPrevious}
              disabled={!canPrevious}
            >
              <ChevronLeft size={24} />
            </button>
            <section className="dockspace-file-viewer__content dockspace-file-viewer__content--fullscreen">
              <FilePreviewContent
                dockspaceId={dockspaceId}
                file={file}
                enabled={isOpen}
                thumbnailUrl={thumbnailUrl ?? null}
              />
            </section>
            <button
              type="button"
              className="dockspace-file-viewer__nav-button dockspace-file-viewer__nav-button--right"
              aria-label="Next media item"
              onClick={onNext}
              disabled={!canNext}
            >
              <ChevronRight size={24} />
            </button>
          </>
        ) : (
          <>
            <header className="dockspace-file-viewer__header">
              <h3 className="dockspace-dialog__title">File preview</h3>
              <p className="dockspace-file-viewer__file-name">{fileName}</p>
            </header>

            <section className="dockspace-file-viewer__content">
              <FilePreviewContent
                dockspaceId={dockspaceId}
                file={file}
                enabled={isOpen}
                thumbnailUrl={thumbnailUrl ?? null}
              />
            </section>

            <div className="dockspace-dialog__actions">
              <Button type="button" variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
};
