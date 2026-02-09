import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreSignUpTriggerEvent } from 'aws-lambda';

const isEmailAllowedMock = vi.fn();

vi.mock('../lib/allowlist.js', () => ({
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
  isEmailAllowed: isEmailAllowedMock
}));

const baseEvent = (): PreSignUpTriggerEvent =>
  ({
    version: '1',
    region: 'us-east-1',
    userPoolId: 'pool-id',
    userName: 'owner@example.com',
    callerContext: {
      awsSdkVersion: '1',
      clientId: 'client-id'
    },
    triggerSource: 'PreSignUp_SignUp',
    request: {
      userAttributes: {
        email: 'owner@example.com'
      },
      validationData: undefined,
      clientMetadata: undefined
    },
    response: {
      autoConfirmUser: false,
      autoVerifyEmail: false,
      autoVerifyPhone: false
    }
  }) as PreSignUpTriggerEvent;

describe('preSignUpAllowlist trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows sign up for allowlisted email', async () => {
    isEmailAllowedMock.mockResolvedValueOnce(true);
    const { handler } = await import('../triggers/preSignUpAllowlist.js');

    await expect(handler(baseEvent())).resolves.toMatchObject({
      userName: 'owner@example.com'
    });
  });

  it('rejects sign up for disallowed email', async () => {
    isEmailAllowedMock.mockResolvedValueOnce(false);
    const { handler } = await import('../triggers/preSignUpAllowlist.js');

    await expect(handler(baseEvent())).rejects.toThrow(
      'This email is not permitted to create an account.'
    );
  });
});
