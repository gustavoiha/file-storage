import { useMemo } from 'react';
import {
  File,
  FileArchive,
  FileBadge,
  FileChartColumn,
  FileCode,
  FileImage,
  FileLock,
  FileMusic,
  FileSliders,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileType,
  FileVideoCamera
} from 'lucide-react';

type FileIconComponent = typeof File;

const extensionFromPath = (fullPath: string): string => {
  const segments = fullPath.split('/').filter(Boolean);
  const fileName = (segments[segments.length - 1] ?? fullPath).toLowerCase();
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return '';
  }

  return fileName.slice(dotIndex + 1);
};

const iconForExtension = (extension: string): FileIconComponent => {
  if (!extension) {
    return File;
  }

  if (['txt', 'md', 'rtf', 'doc', 'docx', 'odt'].includes(extension)) {
    return FileText;
  }

  if (extension === 'pdf') {
    return FileBadge;
  }

  if (['csv', 'tsv', 'xls', 'xlsx', 'ods'].includes(extension)) {
    return FileSpreadsheet;
  }

  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(extension)) {
    return FileArchive;
  }

  if (
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff', 'heic', 'avif'].includes(
      extension
    )
  ) {
    return FileImage;
  }

  if (['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'].includes(extension)) {
    return FileVideoCamera;
  }

  if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(extension)) {
    return FileMusic;
  }

  if (
    ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss', 'sass', 'xml', 'json', 'sql'].includes(
      extension
    )
  ) {
    return FileCode;
  }

  if (['sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd'].includes(extension)) {
    return FileTerminal;
  }

  if (['pem', 'key', 'p12', 'pfx', 'cer', 'crt', 'der'].includes(extension)) {
    return FileLock;
  }

  if (['env', 'ini', 'cfg', 'conf', 'toml', 'yaml', 'yml'].includes(extension)) {
    return FileSliders;
  }

  if (['ppt', 'pptx', 'odp'].includes(extension)) {
    return FileChartColumn;
  }

  if (['ttf', 'otf', 'woff', 'woff2'].includes(extension)) {
    return FileType;
  }

  return File;
};

export const useFileIconForPath = (fullPath: string): FileIconComponent =>
  useMemo(() => iconForExtension(extensionFromPath(fullPath)), [fullPath]);
