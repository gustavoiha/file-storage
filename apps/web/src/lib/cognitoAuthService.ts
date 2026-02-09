import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserSession,
  CognitoUserPool
} from 'amazon-cognito-identity-js';
import { jwtDecode } from 'jwt-decode';
import { env } from './env';
import type {
  AuthService,
  AuthSession,
  ConfirmResetPayload,
  LoginPayload,
  RegisterPayload
} from './authTypes';

interface IdTokenClaims {
  email?: string;
  sub: string;
}

const ALLOWLIST_SIGNUP_MESSAGE = 'This email is not permitted to create an account.';

const mapRegisterError = (error: unknown): Error => {
  if (!(error instanceof Error)) {
    return new Error('Failed to register');
  }

  const codedError = error as Error & { code?: string; name?: string };
  const code = codedError.code ?? codedError.name ?? '';
  const normalizedMessage = error.message.toLowerCase();

  if (
    code === 'UserLambdaValidationException' ||
    normalizedMessage.includes('not permitted to create an account')
  ) {
    return new Error(ALLOWLIST_SIGNUP_MESSAGE);
  }

  return error;
};

const userPool = new CognitoUserPool({
  UserPoolId: env.cognitoUserPoolId,
  ClientId: env.cognitoClientId
});

const createCognitoUser = (email: string): CognitoUser =>
  new CognitoUser({
    Username: email,
    Pool: userPool
  });

const buildSession = (idToken: string, accessToken: string): AuthSession => {
  const claims = jwtDecode<IdTokenClaims>(idToken);

  return {
    idToken,
    accessToken,
    email: claims.email ?? '',
    userId: claims.sub
  };
};

const login = async (payload: LoginPayload): Promise<AuthSession> => {
  const user = createCognitoUser(payload.email);

  return new Promise((resolve, reject) => {
    user.authenticateUser(
      new AuthenticationDetails({
        Username: payload.email,
        Password: payload.password
      }),
      {
        onSuccess: (session) => {
          resolve(
            buildSession(
              session.getIdToken().getJwtToken(),
              session.getAccessToken().getJwtToken()
            )
          );
        },
        onFailure: reject
      }
    );
  });
};

const register = async (payload: RegisterPayload): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    userPool.signUp(
      payload.email,
      payload.password,
      [new CognitoUserAttribute({ Name: 'email', Value: payload.email })],
      [],
      (error) => {
        if (error) {
          reject(mapRegisterError(error));
          return;
        }

        resolve();
      }
    );
  });
};

const logout = async (): Promise<void> => {
  const current = userPool.getCurrentUser();
  current?.signOut();
};

const forgotPassword = async (email: string): Promise<void> => {
  const user = createCognitoUser(email);

  await new Promise<void>((resolve, reject) => {
    user.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: reject
    });
  });
};

const confirmForgotPassword = async (
  payload: ConfirmResetPayload
): Promise<void> => {
  const user = createCognitoUser(payload.email);

  await new Promise<void>((resolve, reject) => {
    user.confirmPassword(payload.code, payload.newPassword, {
      onSuccess: () => resolve(),
      onFailure: reject
    });
  });
};

const changePassword = async (
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  const currentUser = userPool.getCurrentUser();
  if (!currentUser) {
    throw new Error('No active authenticated user');
  }

  await new Promise<void>((resolve, reject) => {
    currentUser.getSession((sessionError: Error | null, session: CognitoUserSession | null) => {
      if (sessionError || !session || !session.isValid()) {
        reject(sessionError ?? new Error('Invalid Cognito session'));
        return;
      }

      currentUser.changePassword(currentPassword, newPassword, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });
};

export const cognitoAuthService: AuthService = {
  login,
  register,
  logout,
  forgotPassword,
  confirmForgotPassword,
  changePassword
};
