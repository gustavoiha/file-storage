import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FilePreviewContent } from '@/components/files/FilePreviewContent';
import { focusIsLost, isFocusable, useDialogTabTrap } from '@/components/files/useDialogDismiss';
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
  const dialogRef = useDialogTabTrap<HTMLDialogElement>(isOpen);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousButtonRef = useRef<HTMLButtonElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const navStateRef = useRef({ canPrevious, canNext });

  // Previous or Next is disabled at either end of the gallery. When that happens to the focused button (Next onto
  // the last item), focus would fall to <body>: move it to the other nav button, else to Close.
  useEffect(() => {
    const was = navStateRef.current;
    navStateRef.current = { canPrevious, canNext };
    if (!isOpen || !isMediaFullscreen) {
      return;
    }

    const lostPrevious = was.canPrevious && !canPrevious;
    const lostNext = was.canNext && !canNext;
    if (!lostPrevious && !lostNext) {
      return;
    }

    const active = document.activeElement;
    const disabledButton = lostNext ? nextButtonRef.current : previousButtonRef.current;
    if (active !== disabledButton && !focusIsLost()) {
      return;
    }

    const otherButton = lostNext ? previousButtonRef.current : nextButtonRef.current;
    const target = [otherButton, closeButtonRef.current].find(isFocusable);
    target?.focus();
  }, [canNext, canPrevious, isMediaFullscreen, isOpen]);

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
          // The press lands on an element that cannot take focus, so its default action would blur whatever the
          // close just focused (the gallery tile) and leave focus on <body>.
          event.preventDefault();
          onClose();
        }
      }}
    >
      <dialog
        ref={dialogRef}
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
            event.preventDefault();
            onClose();
          }
        }}
      >
        {isMediaFullscreen ? (
          <>
            {/* Initial focus: the dialog is announced by its name, and Tab stays inside it (useDialogTabTrap). */}
            <button
              ref={closeButtonRef}
              type="button"
              className="dockspace-file-viewer__close-button"
              aria-label="Close preview"
              title="Close preview"
              onClick={onClose}
              autoFocus
            >
              <X size={24} />
            </button>
            <button
              ref={previousButtonRef}
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
              ref={nextButtonRef}
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
              <h2 className="dockspace-dialog__title">File preview</h2>
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
              <Button type="button" variant="secondary" onClick={onClose} autoFocus>
                Close
              </Button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
};
