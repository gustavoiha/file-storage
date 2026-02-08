import type { FileState } from '../types/models.js';

export const buildFilePk = (userId: string, vaultId: string): string =>
  `U#${userId}#V#${vaultId}`;

export const buildFileSk = (fullPath: string): string => `P#${fullPath}`;

export const buildVaultPk = (userId: string): string => `U#${userId}`;

export const buildVaultSk = (vaultId: string): string => `VAULT#${vaultId}`;

export const buildGsi1Pk = (userId: string, vaultId: string): string =>
  `U#${userId}#V#${vaultId}`;

export const buildGsi1Sk = (
  state: FileState,
  fullPath: string,
  flaggedForDeleteAt?: string
): string => {
  if (state === 'TRASH') {
    if (!flaggedForDeleteAt) {
      throw new Error('TRASH state requires flaggedForDeleteAt');
    }
    return `S#TRASH#T#${flaggedForDeleteAt}#P#${fullPath}`;
  }

  return `S#${state}#P#${fullPath}`;
};
