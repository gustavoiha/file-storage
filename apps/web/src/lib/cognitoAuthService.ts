import {
  confirmSignIn,
  confirmSignUp,
  confirmResetPassword,
  fetchAuthSession,
  resetPassword,
  resendSignUpCode,
  signIn,
  signOut,
  signUp,
  updatePassword
} from 'aws-amplify/auth';
import type { SignInOutput, SignUpOutput } from 'aws-amplify/auth';
import { configureAmplify } from './amplify';
import type {
  AuthService,
  ConfirmSignUpPayload,
  LoginResult,
  ConfirmResetPayload,
  LoginPayload,
  RegisterPayload,
  RegisterResult,
  SignUpConfirmationRequiredResult
} from './authTypes';

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

const toSignUpConfirmationResult = (
  email: string,
  destination?: string
): SignUpConfirmationRequiredResult => ({
  status: 'SIGN_UP_CONFIRMATION_REQUIRED',
  email,
  message: destination
    ? `Enter the confirmation code sent to ${destination}.`
    : 'Enter the confirmation code sent to your email.'
});

const buildSessionFromCurrentTokens = async (): Promise<LoginResult> => {
  const session = await fetchAuthSession();
  const accessToken = session.tokens?.accessToken?.toString();
  const idToken = session.tokens?.idToken?.toString();
  const claims = session.tokens?.idToken?.payload;

  if (!accessToken || !idToken || !claims?.sub) {
    throw new Error('Authenticated session is missing required tokens');
  }

  return {
    status: 'SIGNED_IN',
    session: {
      accessToken,
      idToken,
      email: typeof claims.email === 'string' ? claims.email : '',
      userId: claims.sub
    }
  };
};

const toChallengeResult = (output: SignInOutput, email: string): LoginResult => {
  const step = output.nextStep.signInStep;
  const destination =
    'codeDeliveryDetails' in output.nextStep
      ? output.nextStep.codeDeliveryDetails?.destination
      : undefined;

  if (step === 'CONFIRM_SIGN_UP') {
    return toSignUpConfirmationResult(email, destination);
  }

  if (step === 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE') {
    return {
      status: 'CONFIRMATION_REQUIRED',
      challengeType: 'EMAIL_CODE',
      message: destination
        ? `Enter the verification code sent to ${destination}.`
        : 'Enter the verification code sent to your email.'
    };
  }

  if (step === 'CONFIRM_SIGN_IN_WITH_SMS_CODE') {
    return {
      status: 'CONFIRMATION_REQUIRED',
      challengeType: 'SMS_CODE',
      message: destination
        ? `Enter the verification code sent to ${destination}.`
        : 'Enter the verification code sent by SMS.'
    };
  }

  if (step === 'CONFIRM_SIGN_IN_WITH_TOTP_CODE') {
    return {
      status: 'CONFIRMATION_REQUIRED',
      challengeType: 'TOTP_CODE',
      message: 'Enter the verification code from your authenticator app.'
    };
  }

  throw new Error(`Unsupported sign-in challenge: ${step}`);
};

const mapSignUpOutput = (
  output: SignUpOutput,
  email: string
): RegisterResult => {
  const step = output.nextStep.signUpStep;
  const destination =
    'codeDeliveryDetails' in output.nextStep
      ? output.nextStep.codeDeliveryDetails?.destination
      : undefined;

  if (step === 'CONFIRM_SIGN_UP') {
    return toSignUpConfirmationResult(email, destination);
  }

  if (output.isSignUpComplete || step === 'DONE' || step === 'COMPLETE_AUTO_SIGN_IN') {
    return {
      status: 'REGISTERED'
    };
  }

  throw new Error(`Unsupported sign-up step: ${step}`);
};

const mapSignInOutput = async (
  output: SignInOutput,
  email = ''
): Promise<LoginResult> => {
  if (output.isSignedIn) {
    return buildSessionFromCurrentTokens();
  }

  return toChallengeResult(output, email);
};

const login = async (payload: LoginPayload): Promise<LoginResult> => {
  configureAmplify();

  const output = await signIn({
    username: payload.email,
    password: payload.password
  });

  return mapSignInOutput(output, payload.email);
};

const confirmLogin = async (code: string): Promise<LoginResult> => {
  configureAmplify();

  const output = await confirmSignIn({
    challengeResponse: code
  });

  return mapSignInOutput(output);
};

const register = async (payload: RegisterPayload): Promise<RegisterResult> => {
  configureAmplify();

  try {
    const output = await signUp({
      username: payload.email,
      password: payload.password,
      options: {
        userAttributes: {
          email: payload.email
        }
      }
    });

    return mapSignUpOutput(output, payload.email);
  } catch (error) {
    throw mapRegisterError(error);
  }
};

const confirmSignUpRegistration = async (
  payload: ConfirmSignUpPayload
): Promise<void> => {
  configureAmplify();
  await confirmSignUp({
    username: payload.email,
    confirmationCode: payload.code
  });
};

const resendSignUpConfirmationCode = async (email: string): Promise<void> => {
  configureAmplify();
  await resendSignUpCode({
    username: email
  });
};

const logout = async (): Promise<void> => {
  configureAmplify();
  await signOut();
};

const forgotPassword = async (email: string): Promise<void> => {
  configureAmplify();
  await resetPassword({ username: email });
};

const confirmForgotPassword = async (
  payload: ConfirmResetPayload
): Promise<void> => {
  configureAmplify();
  await confirmResetPassword({
    username: payload.email,
    confirmationCode: payload.code,
    newPassword: payload.newPassword
  });
};

const changePassword = async (
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  configureAmplify();
  await updatePassword({
    oldPassword: currentPassword,
    newPassword
  });
};

export const cognitoAuthService: AuthService = {
  login,
  confirmLogin,
  register,
  confirmSignUp: confirmSignUpRegistration,
  resendSignUpCode: resendSignUpConfirmationCode,
  logout,
  forgotPassword,
  confirmForgotPassword,
  changePassword
};
