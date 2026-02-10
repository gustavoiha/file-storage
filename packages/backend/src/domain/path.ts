const MULTI_SLASH_RE = /\/{2,}/g;

export const normalizeFullPath = (path: string): string => {
  const cleaned = path.trim();
  if (!cleaned) {
    throw new Error('Path cannot be empty');
  }

  const withSingleSlashes = cleaned.replace(MULTI_SLASH_RE, '/');
  const normalized = withSingleSlashes.startsWith('/')
    ? withSingleSlashes
    : `/${withSingleSlashes}`;

  if (normalized === '/') {
    throw new Error('Root path is not a valid file path');
  }

  if (normalized.includes('..')) {
    throw new Error('Parent traversal is not allowed');
  }

  return normalized;
};

export const normalizeFolderPath = (path: string): string => {
  const cleaned = path.trim();
  if (!cleaned || cleaned === '/') {
    return '/';
  }

  const withSingleSlashes = cleaned.replace(MULTI_SLASH_RE, '/');
  const normalized = withSingleSlashes.startsWith('/')
    ? withSingleSlashes
    : `/${withSingleSlashes}`;
  const withoutTrailingSlash = normalized.endsWith('/')
    ? normalized.slice(0, -1)
    : normalized;

  if (withoutTrailingSlash.includes('..')) {
    throw new Error('Parent traversal is not allowed');
  }

  return withoutTrailingSlash || '/';
};

export const toRelativePath = (fullPath: string): string => {
  const normalized = normalizeFullPath(fullPath);
  return normalized.slice(1);
};

export const toFolderPrefix = (path: string): string => {
  const normalized = normalizeFullPath(path);
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
};

export const normalizeNodeName = (name: string): string => {
  const cleaned = name.trim().normalize('NFKC');
  if (!cleaned) {
    throw new Error('Name cannot be empty');
  }

  return cleaned.toLocaleLowerCase();
};

export const splitFullPath = (
  fullPath: string
): {
  normalizedFullPath: string;
  fileName: string;
  folderSegments: string[];
  folderPath: string;
} => {
  const normalizedFullPath = normalizeFullPath(fullPath);
  const allSegments = normalizedFullPath.slice(1).split('/').filter(Boolean);

  if (!allSegments.length) {
    throw new Error('Path must include a file name');
  }

  const fileName = allSegments[allSegments.length - 1] ?? '';
  const folderSegments = allSegments.slice(0, -1);
  const folderPath = folderSegments.length ? `/${folderSegments.join('/')}` : '/';

  return {
    normalizedFullPath,
    fileName,
    folderSegments,
    folderPath
  };
};

export const splitFolderPath = (folderPath: string): string[] => {
  const normalized = normalizeFolderPath(folderPath);
  if (normalized === '/') {
    return [];
  }

  return normalized.slice(1).split('/').filter(Boolean);
};

export const buildFullPath = (folderPath: string, name: string): string => {
  const normalizedFolder = normalizeFolderPath(folderPath);
  const cleanedName = name.trim();
  if (!cleanedName) {
    throw new Error('Name cannot be empty');
  }

  return normalizedFolder === '/' ? `/${cleanedName}` : `${normalizedFolder}/${cleanedName}`;
};
