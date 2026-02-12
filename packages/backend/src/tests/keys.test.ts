import { describe, expect, it } from 'vitest';
import {
  buildDirectoryNamePrefix,
  buildDirectoryPrefix,
  buildDirectorySk,
  buildFilePk,
  buildFileNodeSk,
  buildFolderNodeSk,
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
});
