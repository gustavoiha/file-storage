import { describe, expect, it } from 'vitest';
import {
  buildDirectoryNamePrefix,
  buildDirectoryPrefix,
  buildDirectorySk,
  buildFilePk,
  buildFileNodeSk,
  buildFileStateIndexPrefix,
  buildFileStateIndexSk,
  buildFolderNodeSk,
  buildPurgeDueGsi1Sk,
  buildPurgeDueUpperBoundGsi1Sk,
  parseDockspacePartitionSk,
  PURGE_DUE_GSI1_PK,
  ROOT_FOLDER_NODE_ID,
  buildDockspacePk,
  buildDockspaceSk
} from '../domain/keys.js';

describe('keys', () => {
  it('builds node and dockspace keys', () => {
    expect(buildFilePk('u1', 'v1')).toBe('U#u1#S#v1');
    expect(buildFileNodeSk('file_1')).toBe('L#file_1');
    expect(buildFolderNodeSk('folder_1')).toBe('F#folder_1');
    expect(buildDockspacePk('u1')).toBe('U#u1');
    expect(buildDockspaceSk('v1')).toBe('S#v1');
    expect(ROOT_FOLDER_NODE_ID).toBe('root');
  });

  it('builds directory keys', () => {
    expect(buildDirectorySk('root', 'L', 'photo.jpg', 'file_1')).toBe(
      'D#root#L#photo.jpg#file_1'
    );
    expect(buildDirectoryPrefix('root')).toBe('D#root#');
    expect(buildDirectoryPrefix('root', 'F')).toBe('D#root#F#');
    expect(buildDirectoryNamePrefix('root', 'L', 'photo.jpg')).toBe(
      'D#root#L#photo.jpg#'
    );
  });

  it('builds purge-due index keys', () => {
    expect(PURGE_DUE_GSI1_PK).toBe('PURGE_DUE');
    expect(buildPurgeDueGsi1Sk('2026-02-16T00:00:00.000Z', 'U#u1#S#v1', 'L#file_1')).toBe(
      '2026-02-16T00:00:00.000Z#U#u1#S#v1#L#file_1'
    );
    expect(buildPurgeDueUpperBoundGsi1Sk('2026-02-16T00:00:00.000Z')).toBe(
      '2026-02-16T00:00:00.000Z#~'
    );
  });

  it('parses dockspace partition key', () => {
    expect(parseDockspacePartitionSk('U#u1#S#v1')).toEqual({ userId: 'u1', dockspaceId: 'v1' });
    expect(parseDockspacePartitionSk('U##S#v1')).toBeNull();
    expect(parseDockspacePartitionSk('invalid')).toBeNull();
  });

  it('builds file-state index keys', () => {
    expect(buildFileStateIndexSk('TRASH', '2026-02-16T00:00:00.000Z', 'file_1')).toBe(
      'X#TRASH#2026-02-16T00:00:00.000Z#file_1'
    );
    expect(buildFileStateIndexSk('PURGED', '2026-02-16T00:00:00.000Z', 'file_1')).toBe(
      'X#PURGED#2026-02-16T00:00:00.000Z#file_1'
    );
    expect(buildFileStateIndexPrefix('TRASH')).toBe('X#TRASH#');
    expect(buildFileStateIndexPrefix('PURGED')).toBe('X#PURGED#');
  });
});
