const MULTI_SLASH_RE = /\/{2,}/g;
const EDGE_SLASH_RE = /^\/+|\/+$/g;

export const buildPathInFolder = (folder: string, name: string): string => {
  const cleanedName = name.trim().replace(/^\/+/, '');

  if (!cleanedName) {
    throw new Error('Name cannot be empty');
  }

  const normalizedFolder = folder.trim();
  const folderPrefix =
    !normalizedFolder || normalizedFolder === '/'
      ? ''
      : `/${normalizedFolder.replace(EDGE_SLASH_RE, '')}`;

  return `${folderPrefix}/${cleanedName}`.replace(MULTI_SLASH_RE, '/');
};

export const isValidFileName = (name: string): boolean =>
  Boolean(name.trim()) && !name.includes('/') && !name.includes('\\');
