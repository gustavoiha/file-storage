import type { PreSignUpTriggerEvent } from 'aws-lambda';
import { isEmailAllowed, normalizeEmail } from '../lib/allowlist.js';

const ALLOWLIST_ERROR_MESSAGE = 'This email is not permitted to create an account.';

export const handler = async (event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> => {
  const email = event.request.userAttributes.email;

  if (!email || !(await isEmailAllowed(normalizeEmail(email)))) {
    throw new Error(ALLOWLIST_ERROR_MESSAGE);
  }

  return event;
};
