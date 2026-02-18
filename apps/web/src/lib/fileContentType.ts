const extensionContentTypeMap: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm'
};

const fileExtension = (fileName: string): string | null => {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName.trim());
  if (!match) {
    return null;
  }

  return match[1]?.toLowerCase() ?? null;
};

export const inferUploadContentType = (file: Pick<File, 'name' | 'type'>): string => {
  const declared = file.type.trim().toLowerCase();
  if (declared) {
    return declared;
  }

  const extension = fileExtension(file.name);
  if (!extension) {
    return 'application/octet-stream';
  }

  return extensionContentTypeMap[extension] ?? 'application/octet-stream';
};

export const isLikelyMediaFile = (file: Pick<File, 'name' | 'type'>): boolean => {
  const contentType = inferUploadContentType(file);
  return contentType.startsWith('image/') || contentType.startsWith('video/');
};
