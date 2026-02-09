import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostConfirmationTriggerEvent } from 'aws-lambda';

const sendMock = vi.fn();

vi.mock('../lib/clients.js', () => ({
  cognitoIdentityProviderClient: {
    send: sendMock
  }
}));

const baseEvent = (): PostConfirmationTriggerEvent =>
  ({
    version: '1',
    region: 'us-east-1',
    userPoolId: 'pool-id',
    userName: 'owner@example.com',
    triggerSource: 'PostConfirmation_ConfirmSignUp',
    callerContext: {
      awsSdkVersion: '1',
      clientId: 'client-id'
    },
    request: {
      userAttributes: {
        email: 'owner@example.com'
      },
      clientMetadata: undefined
    },
    response: {}
  }) as PostConfirmationTriggerEvent;

describe('postConfirmationAssignGroup trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENTITLED_GROUP_NAME = 'entitled-users';
  });

  it('adds user to entitlement group', async () => {
    sendMock.mockResolvedValueOnce({});
    const { handler } = await import('../triggers/postConfirmationAssignGroup.js');

    await expect(handler(baseEvent())).resolves.toMatchObject({
      userName: 'owner@example.com'
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
