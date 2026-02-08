import { describe, expect, it } from 'vitest';
import {
  buildFilePk,
  buildFileSk,
  buildGsi1Pk,
  buildGsi1Sk,
  buildVaultPk,
  buildVaultSk
} from '../domain/keys.js';

describe('keys', () => {
  it('builds file and vault keys', () => {
    expect(buildFilePk('u1', 'v1')).toBe('U#u1#V#v1');
    expect(buildFileSk('/a/b')).toBe('P#/a/b');
    expect(buildVaultPk('u1')).toBe('U#u1');
    expect(buildVaultSk('v1')).toBe('VAULT#v1');
    expect(buildGsi1Pk('u1', 'v1')).toBe('U#u1#V#v1');
  });

  it('builds sortable gsi keys', () => {
    expect(buildGsi1Sk('ACTIVE', '/x')).toBe('S#ACTIVE#P#/x');
    expect(buildGsi1Sk('PURGED', '/x')).toBe('S#PURGED#P#/x');
    expect(buildGsi1Sk('TRASH', '/x', '2026-01-01T00:00:00.000Z')).toBe(
      'S#TRASH#T#2026-01-01T00:00:00.000Z#P#/x'
    );
  });
});
