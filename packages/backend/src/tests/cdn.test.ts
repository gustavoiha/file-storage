import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ssmSendMock } = vi.hoisted(() => ({
  ssmSendMock: vi.fn()
}));

vi.mock('../lib/clients.js', () => ({
  ssmClient: {
    send: ssmSendMock
  }
}));

const ensureEnv = () => {
  process.env.FILE_READ_DOMAIN_NAME = 'd111111abcdef8.cloudfront.net';
  process.env.FILE_READ_KEY_PAIR_ID = 'K1234567890';
  process.env.FILE_READ_PRIVATE_KEY_PARAMETER_NAME = '/dockspace/dev/cloudfront/private-key';
};

describe('cdn url signer', () => {
  beforeEach(() => {
    vi.resetModules();
    ssmSendMock.mockReset();
    ensureEnv();

    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048
    });
    const privateKeyPem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
    ssmSendMock.mockResolvedValue({
      Parameter: {
        Value: privateKeyPem
      }
    });
  });

  it('creates signed cloudfront urls for per-object reads', async () => {
    const { createFileReadUrl } = await import('../lib/cdn.js');
    const signed = await createFileReadUrl('dock-1/file-1', {
      expiresInSeconds: 120
    });
    const url = new URL(signed.url);

    expect(signed.expiresInSeconds).toBe(120);
    expect(url.host).toBe('d111111abcdef8.cloudfront.net');
    expect(url.pathname).toBe('/dock-1/file-1');
    expect(url.searchParams.get('Key-Pair-Id')).toBe('K1234567890');
    expect(url.searchParams.get('Expires')).toBeTruthy();
    expect(url.searchParams.get('Signature')).toBeTruthy();
    expect(ssmSendMock).toHaveBeenCalledTimes(1);
  });

  it('adds response-content-disposition for attachment flows', async () => {
    const { createFileReadUrl } = await import('../lib/cdn.js');
    const signed = await createFileReadUrl('dock-1/file-1', {
      asAttachment: true,
      fileName: 'name with space.txt'
    });
    const url = new URL(signed.url);

    expect(url.searchParams.get('response-content-disposition')).toContain('attachment;');
    expect(url.searchParams.get('response-content-disposition')).toContain("filename*=UTF-8''");
  });

  it('caches private key reads after first resolve', async () => {
    const { createFileReadUrl } = await import('../lib/cdn.js');
    await createFileReadUrl('dock-1/file-1');
    await createFileReadUrl('dock-1/file-2');

    expect(ssmSendMock).toHaveBeenCalledTimes(1);
  });
});
