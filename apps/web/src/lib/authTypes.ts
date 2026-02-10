export interface AuthSession {
  accessToken: string;
  idToken: string;
  email: string;
  userId: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export type LoginChallengeType = 'EMAIL_CODE' | 'SMS_CODE' | 'TOTP_CODE';

export interface SignUpConfirmationRequiredResult {
  status: 'SIGN_UP_CONFIRMATION_REQUIRED';
  email: string;
  message: string;
}

export type LoginResult =
  | {
      status: 'SIGNED_IN';
      session: AuthSession;
    }
  | {
      status: 'CONFIRMATION_REQUIRED';
      challengeType: LoginChallengeType;
      message: string;
    }
  | SignUpConfirmationRequiredResult;

export type RegisterResult =
  | {
      status: 'REGISTERED';
    }
  | SignUpConfirmationRequiredResult;

export interface RegisterPayload {
  email: string;
  password: string;
}

export interface ConfirmSignUpPayload {
  email: string;
  code: string;
}

export interface ConfirmResetPayload {
  email: string;
  code: string;
  newPassword: string;
}

export interface AuthService {
  login(payload: LoginPayload): Promise<LoginResult>;
  confirmLogin(code: string): Promise<LoginResult>;
  register(payload: RegisterPayload): Promise<RegisterResult>;
  confirmSignUp(payload: ConfirmSignUpPayload): Promise<void>;
  resendSignUpCode(email: string): Promise<void>;
  logout(): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  confirmForgotPassword(payload: ConfirmResetPayload): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
}
