import { Readable } from 'node:stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn()
}));

vi.mock('../lib/clients.js', () => ({
  s3Client: {
    send: sendMock
  }
}));

beforeEach(() => {
  process.env.BUCKET_NAME = 'bucket';
  process.env.TABLE_NAME = 'table';
  sendMock.mockReset();
  vi.resetModules();
});

describe('computeObjectSha256Hex', () => {
  it('hashes object data from a readable stream without buffering full payload in caller', async () => {
    sendMock.mockResolvedValue({
      Body: Readable.from([Buffer.from('hello '), Buffer.from('world')])
    });

    const { computeObjectSha256Hex } = await import('../lib/s3.js');
    const hash = await computeObjectSha256Hex('dock-1/file-1');

    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
  });
});
