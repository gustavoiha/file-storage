import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import type { FileRecord } from '@/lib/apiTypes';
import { createFileDownloadSession } from '@/lib/vaultApi';

type PreviewKind = 'pdf' | 'image' | 'text' | 'audio' | 'video' | 'unsupported';
const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;

interface FileViewerDialogProps {
  file: FileRecord | null;
  isOpen: boolean;
  onClose: () => void;
  vaultId: string;
}

const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']);
const TEXT_EXTENSIONS = new Set([
  'csv',
  'css',
  'html',
  'ini',
  'js',
  'json',
  'log',
  'md',
  'mjs',
  'txt',
  'xml',
  'yaml',
  'yml'
]);
const AUDIO_EXTENSIONS = new Set(['aac', 'm4a', 'mp3', 'ogg', 'wav']);
const VIDEO_EXTENSIONS = new Set(['mov', 'mp4', 'ogv', 'webm']);

const basename = (fullPath: string): string => {
  const segments = fullPath.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? fullPath;
};

const extensionFromName = (name: string): string => {
  const index = name.lastIndexOf('.');
  if (index < 0 || index === name.length - 1) {
    return '';
  }

  return name.slice(index + 1).toLowerCase();
};

const inferPreviewKind = (contentType: string | undefined, fileName: string): PreviewKind => {
  const normalizedContentType = contentType?.toLowerCase().trim() ?? '';
  const extension = extensionFromName(fileName);

  if (normalizedContentType === 'application/pdf' || extension === 'pdf') {
    return 'pdf';
  }

  if (normalizedContentType.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }

  if (
    normalizedContentType.startsWith('text/') ||
    normalizedContentType === 'application/json' ||
    normalizedContentType === 'application/xml' ||
    normalizedContentType === 'application/javascript' ||
    normalizedContentType === 'application/yaml' ||
    TEXT_EXTENSIONS.has(extension)
  ) {
    return 'text';
  }

  if (normalizedContentType.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension)) {
    return 'audio';
  }

  if (normalizedContentType.startsWith('video/') || VIDEO_EXTENSIONS.has(extension)) {
    return 'video';
  }

  return 'unsupported';
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Unable to load file preview.';
};

export const FileViewerDialog = ({ file, isOpen, onClose, vaultId }: FileViewerDialogProps) => {
  const fileNodeId = file?.fileNodeId?.trim() ?? '';
  const fallbackName = file ? basename(file.fullPath) : '';

  const sessionQuery = useQuery({
    queryKey: ['file-download-session', vaultId, fileNodeId],
    queryFn: () => createFileDownloadSession(vaultId, fileNodeId),
    enabled: isOpen && Boolean(vaultId && fileNodeId)
  });

  const session = sessionQuery.data;
  const fileName = session?.fileName || fallbackName;
  const isOverPreviewLimit =
    typeof session?.size === 'number' && session.size > MAX_PREVIEW_BYTES;
  const kind = useMemo(
    () => inferPreviewKind(session?.contentType, fileName),
    [fileName, session?.contentType]
  );

  const textQuery = useQuery({
    queryKey: ['file-view-content', session?.downloadUrl],
    enabled: isOpen && !isOverPreviewLimit && kind === 'text' && Boolean(session?.downloadUrl),
    queryFn: async () => {
      const response = await fetch(session?.downloadUrl ?? '');
      if (!response.ok) {
        throw new Error('Unable to load text preview.');
      }

      return response.text();
    }
  });

  if (!isOpen) {
    return null;
  }

  return (
    <div className="vault-dialog-backdrop">
      <dialog
        className="vault-dialog vault-dialog--viewer"
        open
        aria-modal="true"
        aria-label={fileName ? `Preview ${fileName}` : 'File preview'}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <header className="vault-file-viewer__header">
          <h3 className="vault-dialog__title">File preview</h3>
          <p className="vault-file-viewer__file-name">{fileName}</p>
        </header>

        <section className="vault-file-viewer__content">
          {!fileNodeId ? <Alert message="File preview is unavailable for this item." /> : null}

          {fileNodeId && sessionQuery.isPending ? <p>Loading preview...</p> : null}

          {fileNodeId && sessionQuery.error ? <Alert message={errorMessage(sessionQuery.error)} /> : null}

          {session?.downloadUrl && isOverPreviewLimit ? (
            <div className="vault-file-viewer__fallback">
              <p>Preview is limited to files up to 20MB.</p>
              <a
                className="vault-file-viewer__open-link"
                href={session.downloadUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open file in a new tab
              </a>
            </div>
          ) : null}

          {session?.downloadUrl && !isOverPreviewLimit && kind === 'pdf' ? (
            <iframe
              className="vault-file-viewer__frame"
              src={session.downloadUrl}
              title={fileName}
            />
          ) : null}

          {session?.downloadUrl && !isOverPreviewLimit && kind === 'image' ? (
            <div className="vault-file-viewer__image-wrap">
              <img className="vault-file-viewer__image" src={session.downloadUrl} alt={fileName} />
            </div>
          ) : null}

          {session?.downloadUrl && !isOverPreviewLimit && kind === 'audio' ? (
            <audio className="vault-file-viewer__media" controls src={session.downloadUrl}>
              Your browser does not support audio playback.
            </audio>
          ) : null}

          {session?.downloadUrl && !isOverPreviewLimit && kind === 'video' ? (
            <video className="vault-file-viewer__media" controls src={session.downloadUrl}>
              Your browser does not support video playback.
            </video>
          ) : null}

          {session?.downloadUrl && !isOverPreviewLimit && kind === 'text' && textQuery.isPending ? (
            <p>Loading text preview...</p>
          ) : null}

          {session?.downloadUrl && !isOverPreviewLimit && kind === 'text' && textQuery.error ? (
            <Alert message={errorMessage(textQuery.error)} />
          ) : null}

          {session?.downloadUrl && !isOverPreviewLimit && kind === 'text' && textQuery.data ? (
            <pre className="vault-file-viewer__text">{textQuery.data}</pre>
          ) : null}

          {session?.downloadUrl && !isOverPreviewLimit && kind === 'unsupported' ? (
            <div className="vault-file-viewer__fallback">
              <p>Preview is not available for this file type.</p>
              <a
                className="vault-file-viewer__open-link"
                href={session.downloadUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open file in a new tab
              </a>
            </div>
          ) : null}
        </section>

        <div className="vault-dialog__actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </dialog>
    </div>
  );
};
