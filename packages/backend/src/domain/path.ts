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

export const toRelativePath = (fullPath: string): string => {
  const normalized = normalizeFullPath(fullPath);
  return normalized.slice(1);
};

export const toFolderPrefix = (path: string): string => {
  const normalized = normalizeFullPath(path);
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
};
