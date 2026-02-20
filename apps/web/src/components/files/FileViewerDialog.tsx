import { Button } from '@/components/ui/Button';
import { FilePreviewContent } from '@/components/files/FilePreviewContent';
import type { FileRecord } from '@/lib/apiTypes';

interface FileViewerDialogProps {
  file: FileRecord | null;
  isOpen: boolean;
  onClose: () => void;
  dockspaceId: string;
  thumbnailUrl?: string | null;
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
  thumbnailUrl
}: FileViewerDialogProps) => {
  const fileName = file ? basename(file.fullPath) : '';

  if (!isOpen) {
    return null;
  }

  return (
    <div className="dockspace-dialog-backdrop">
      <dialog
        className="dockspace-dialog dockspace-dialog--viewer"
        open
        aria-modal="true"
        aria-label={fileName ? `Preview ${fileName}` : 'File preview'}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
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
      </dialog>
    </div>
  );
};
