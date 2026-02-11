import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();

vi.mock('../lib/clients.js', () => ({
  ssmClient: {
    send: sendMock
  }
}));

const loadAllowlistModule = async () => import('../lib/allowlist.js');

describe('allowlist helper', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.ALLOWLIST_SSM_PARAMETER_NAME = '/dockspace/auth/allowed-signup-emails';
    const mod = await loadAllowlistModule();
    mod.resetAllowlistCache();
  });

  it('accepts allowlisted emails with normalization', async () => {
    sendMock.mockResolvedValueOnce({
      Parameter: {
        Value: ' owner@example.com,second@example.com '
      }
    });

    const mod = await loadAllowlistModule();
    await expect(mod.isEmailAllowed(' Owner@Example.com ')).resolves.toBe(true);
  });

  it('rejects empty allowlist', async () => {
    sendMock.mockResolvedValueOnce({
      Parameter: {
        Value: ' '
      }
    });

    const mod = await loadAllowlistModule();
    await expect(mod.getAllowlistEmails()).rejects.toThrow('Allowlist parameter is empty');
  });

  it('fails closed when ssm read fails', async () => {
    sendMock.mockRejectedValueOnce(new Error('ssm unavailable'));

    const mod = await loadAllowlistModule();
    await expect(mod.isEmailAllowed('owner@example.com')).rejects.toThrow('ssm unavailable');
  });
});
