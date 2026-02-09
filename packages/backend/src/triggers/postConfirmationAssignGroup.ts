import { AdminAddUserToGroupCommand } from '@aws-sdk/client-cognito-identity-provider';
import type { PostConfirmationTriggerEvent } from 'aws-lambda';
import { cognitoIdentityProviderClient } from '../lib/clients.js';

const getEntitledGroupName = (): string => {
  const value = process.env.ENTITLED_GROUP_NAME;
  if (!value) {
    throw new Error('Missing required env var: ENTITLED_GROUP_NAME');
  }

  return value;
};

export const handler = async (
  event: PostConfirmationTriggerEvent
): Promise<PostConfirmationTriggerEvent> => {
  await cognitoIdentityProviderClient.send(
    new AdminAddUserToGroupCommand({
      GroupName: getEntitledGroupName(),
      UserPoolId: event.userPoolId,
      Username: event.userName
    })
  );

  return event;
};
