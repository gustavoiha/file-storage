const SIZE_UNITS = ['KB', 'MB', 'GB', 'TB'] as const;

export const formatFileSize = (bytes: number | undefined | null): string | null => {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return null;
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const unit = SIZE_UNITS[unitIndex] ?? 'KB';
  const decimals = unit === 'KB' || value >= 10 ? 0 : 1;
  return `${value.toFixed(decimals)} ${unit}`;
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

export const formatModifiedDate = (isoDate: string | undefined | null): string | null => {
  if (!isoDate) {
    return null;
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return dateFormatter.format(date);
};

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit'
});

/** Date and time to the second, e.g. "Nov 21, 2026, 10:05:32 AM". */
export const formatDateTime = (isoDate: string | undefined | null): string | null => {
  if (!isoDate) {
    return null;
  }

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return dateTimeFormatter.format(date);
};

const TYPE_LABELS_BY_EXTENSION: Record<string, string> = {
  avif: 'AVIF image',
  bmp: 'BMP image',
  csv: 'CSV file',
  doc: 'Word document',
  docx: 'Word document',
  gif: 'GIF image',
  heic: 'HEIC image',
  jpeg: 'JPEG image',
  jpg: 'JPEG image',
  json: 'JSON file',
  m4a: 'M4A audio',
  md: 'Markdown file',
  mov: 'QuickTime video',
  mp3: 'MP3 audio',
  mp4: 'MP4 video',
  pdf: 'PDF document',
  png: 'PNG image',
  svg: 'SVG image',
  txt: 'Plain text',
  wav: 'WAV audio',
  webm: 'WebM video',
  webp: 'WebP image',
  xls: 'Excel spreadsheet',
  xlsx: 'Excel spreadsheet',
  zip: 'ZIP archive'
};

const TYPE_LABELS_BY_CONTENT_TYPE: Record<string, string> = {
  'application/json': 'JSON file',
  'application/pdf': 'PDF document',
  'application/zip': 'ZIP archive',
  'audio/mpeg': 'MP3 audio',
  'image/gif': 'GIF image',
  'image/jpeg': 'JPEG image',
  'image/png': 'PNG image',
  'image/webp': 'WebP image',
  'text/csv': 'CSV file',
  'text/markdown': 'Markdown file',
  'text/plain': 'Plain text',
  'video/mp4': 'MP4 video',
  'video/quicktime': 'QuickTime video'
};

const extensionFromName = (fileName: string): string => {
  const index = fileName.lastIndexOf('.');
  if (index <= 0 || index === fileName.length - 1) {
    return '';
  }

  return fileName.slice(index + 1).toLowerCase();
};

export const describeFileType = (
  contentType: string | undefined | null,
  fileName: string
): string | null => {
  const normalized = contentType?.toLowerCase().split(';')[0]?.trim() ?? '';
  if (normalized && TYPE_LABELS_BY_CONTENT_TYPE[normalized]) {
    return TYPE_LABELS_BY_CONTENT_TYPE[normalized] ?? null;
  }

  const byExtension = TYPE_LABELS_BY_EXTENSION[extensionFromName(fileName)];
  if (byExtension) {
    return byExtension;
  }

  if (normalized && normalized !== 'application/octet-stream') {
    return normalized;
  }

  return null;
};

export const pluralize = (count: number, singular: string, plural = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : plural}`;
