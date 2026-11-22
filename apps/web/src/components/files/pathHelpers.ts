const MULTI_SLASH_RE = /\/{2,}/g;
const EDGE_SLASH_RE = /^\/+|\/+$/g;
const BACKSLASH_RE = /\\/g;

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

export const normalizeUploadPath = (path: string): string =>
  path.trim().replace(BACKSLASH_RE, '/').replace(/^\/+/, '').replace(MULTI_SLASH_RE, '/');

export const isValidUploadPath = (path: string): boolean => {
  const normalized = normalizeUploadPath(path);
  if (!normalized) {
    return false;
  }

  const segments = normalized.split('/');
  return segments.every((segment) => {
    const trimmed = segment.trim();
    return Boolean(trimmed) && trimmed !== '.' && trimmed !== '..';
  });
};

/** The notice shown when some selected files were skipped because their upload paths are invalid. */
export const invalidUploadPathsMessage = (skippedCount: number): string =>
  skippedCount === 1
    ? '1 file had an invalid upload path and was skipped.'
    : `${skippedCount} files had invalid upload paths and were skipped.`;

export const normalizeNodeName = (name: string): string =>
  name.trim().normalize('NFKC').replace(/\s+/g, '-').toLocaleLowerCase();

const FOLDER_SEPARATOR = '/';

const normalizeFolderForComparison = (folder: string): string => {
  const trimmed = folder.trim().replace(EDGE_SLASH_RE, '').replace(MULTI_SLASH_RE, '/');
  return trimmed ? `/${trimmed}` : '/';
};

/**
 * Given the full destination paths of a folder upload, returns the folders that must exist
 * before any file is uploaded, reduced to the deepest ("leaf") folders only. Creating a leaf
 * folder creates all of its ancestors server-side, so this is the minimal set of sequential
 * create-folder requests. The current folder itself (and the root) is excluded because it
 * already exists. Result is sorted shallowest first for deterministic behaviour.
 */
export const leafFolderPathsForUploads = (fullPaths: string[], currentFolderPath: string): string[] => {
  const current = normalizeFolderForComparison(currentFolderPath);
  const folders = new Set<string>();

  for (const fullPath of fullPaths) {
    const separatorIndex = fullPath.lastIndexOf(FOLDER_SEPARATOR);
    const folder = separatorIndex > 0 ? fullPath.slice(0, separatorIndex) : '/';
    if (folder !== '/' && folder !== current) {
      folders.add(folder);
    }
  }

  const all = [...folders];
  return all
    .filter((folder) => !all.some((other) => other !== folder && other.startsWith(`${folder}/`)))
    .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
};
