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

export interface RegisterPayload {
  email: string;
  password: string;
}

export interface ConfirmResetPayload {
  email: string;
  code: string;
  newPassword: string;
}

export interface AuthService {
  login(payload: LoginPayload): Promise<AuthSession>;
  register(payload: RegisterPayload): Promise<void>;
  logout(): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  confirmForgotPassword(payload: ConfirmResetPayload): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
}
