import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '@/components/ui/Alert';
import type { FileRecord } from '@/lib/apiTypes';
import { createFileDownloadSession } from '@/lib/dockspaceApi';

type PreviewKind = 'pdf' | 'image' | 'text' | 'audio' | 'video' | 'unsupported';
const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;

interface FilePreviewContentProps {
  dockspaceId: string;
  file: FileRecord | null;
  enabled?: boolean;
  thumbnailUrl?: string | null;
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

export const FilePreviewContent = ({
  dockspaceId,
  file,
  enabled = true,
  thumbnailUrl
}: FilePreviewContentProps) => {
  const [isOriginalReady, setIsOriginalReady] = useState(false);
  const fileNodeId = file?.fileNodeId?.trim() ?? '';
  const fallbackName = file ? basename(file.fullPath) : '';

  const sessionQuery = useQuery({
    queryKey: ['file-download-session', dockspaceId, fileNodeId],
    queryFn: () => createFileDownloadSession(dockspaceId, fileNodeId),
    enabled: enabled && Boolean(dockspaceId && fileNodeId)
  });

  const session = sessionQuery.data;
  const fileName = session?.fileName || fallbackName;
  const hintedKind = useMemo(
    () => inferPreviewKind(file?.contentType, fallbackName),
    [fallbackName, file?.contentType]
  );
  const isOverPreviewLimit = typeof session?.size === 'number' && session.size > MAX_PREVIEW_BYTES;
  const kind = useMemo(
    () => inferPreviewKind(session?.contentType ?? file?.contentType, fileName),
    [file?.contentType, fileName, session?.contentType]
  );

  useEffect(() => {
    setIsOriginalReady(false);
  }, [kind, session?.downloadUrl, thumbnailUrl]);

  const textQuery = useQuery({
    queryKey: ['file-view-content', session?.downloadUrl],
    enabled: enabled && !isOverPreviewLimit && kind === 'text' && Boolean(session?.downloadUrl),
    queryFn: async () => {
      const response = await fetch(session?.downloadUrl ?? '');
      if (!response.ok) {
        throw new Error('Unable to load text preview.');
      }

      return response.text();
    }
  });

  if (!fileNodeId) {
    return <Alert message="File preview is unavailable for this item." />;
  }

  if (sessionQuery.isPending) {
    if (thumbnailUrl && (hintedKind === 'image' || hintedKind === 'video')) {
      return (
        <div
          className={
            hintedKind === 'video' ? 'dockspace-file-viewer__media-wrap' : 'dockspace-file-viewer__image-wrap'
          }
          data-loaded="false"
        >
          <img
            className="dockspace-file-viewer__thumbnail-placeholder"
            src={thumbnailUrl}
            alt=""
            aria-hidden="true"
          />
        </div>
      );
    }

    return <p>Loading preview...</p>;
  }

  if (sessionQuery.error) {
    return <Alert message={errorMessage(sessionQuery.error)} />;
  }

  if (!session?.downloadUrl) {
    return <Alert message="File preview is unavailable for this item." />;
  }

  if (isOverPreviewLimit) {
    return (
      <div className="dockspace-file-viewer__fallback">
        <p>Preview is limited to files up to 20MB.</p>
        <a
          className="dockspace-file-viewer__open-link"
          href={session.downloadUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open file in a new tab
        </a>
      </div>
    );
  }

  if (kind === 'pdf') {
    return <iframe className="dockspace-file-viewer__frame" src={session.downloadUrl} title={fileName} />;
  }

  if (kind === 'image') {
    return (
      <div className="dockspace-file-viewer__image-wrap" data-loaded={isOriginalReady}>
        {thumbnailUrl ? (
          <img
            className="dockspace-file-viewer__thumbnail-placeholder"
            src={thumbnailUrl}
            alt=""
            aria-hidden="true"
          />
        ) : null}
        <img
          className="dockspace-file-viewer__image"
          data-loaded={isOriginalReady}
          src={session.downloadUrl}
          alt={fileName}
          onLoad={() => setIsOriginalReady(true)}
        />
      </div>
    );
  }

  if (kind === 'audio') {
    return (
      <audio className="dockspace-file-viewer__media" controls src={session.downloadUrl}>
        Your browser does not support audio playback.
      </audio>
    );
  }

  if (kind === 'video') {
    return (
      <div className="dockspace-file-viewer__media-wrap" data-loaded={isOriginalReady}>
        {thumbnailUrl ? (
          <img
            className="dockspace-file-viewer__thumbnail-placeholder"
            src={thumbnailUrl}
            alt=""
            aria-hidden="true"
          />
        ) : null}
        <video
          className="dockspace-file-viewer__media dockspace-file-viewer__media--video"
          controls
          src={session.downloadUrl}
          poster={thumbnailUrl ?? undefined}
          onCanPlay={() => setIsOriginalReady(true)}
        >
          Your browser does not support video playback.
        </video>
      </div>
    );
  }

  if (kind === 'text' && textQuery.isPending) {
    return <p>Loading text preview...</p>;
  }

  if (kind === 'text' && textQuery.error) {
    return <Alert message={errorMessage(textQuery.error)} />;
  }

  if (kind === 'text' && textQuery.data) {
    return <pre className="dockspace-file-viewer__text">{textQuery.data}</pre>;
  }

  return (
    <div className="dockspace-file-viewer__fallback">
      <p>Preview is not available for this file type.</p>
      <a className="dockspace-file-viewer__open-link" href={session.downloadUrl} target="_blank" rel="noreferrer">
        Open file in a new tab
      </a>
    </div>
  );
};
