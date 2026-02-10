import { Amplify } from 'aws-amplify';
import { env } from './env';

let configured = false;

export const configureAmplify = (): void => {
  if (configured) {
    return;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: env.cognitoUserPoolId,
        userPoolClientId: env.cognitoClientId,
        loginWith: {
          email: true
        }
      }
    }
  });

  configured = true;
};
