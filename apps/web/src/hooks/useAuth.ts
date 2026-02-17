import { useStore } from '@tanstack/react-store';
import { authStore, clearSession, setSession } from '@/lib/authStore';
import type {
  AuthService,
  ConfirmSignUpPayload,
  ConfirmResetPayload,
  LoginResult,
  LoginPayload,
  RegisterResult,
  RegisterPayload
} from '@/lib/authTypes';

interface UseAuthOptions {
  authService?: AuthService;
}

let defaultAuthServicePromise: Promise<AuthService> | null = null;

const resolveAuthService = async (authService?: AuthService): Promise<AuthService> => {
  if (authService) {
    return authService;
  }

  if (!defaultAuthServicePromise) {
    defaultAuthServicePromise = import('@/lib/cognitoAuthService').then(
      ({ cognitoAuthService }) => cognitoAuthService
    );
  }

  return defaultAuthServicePromise;
};

export const useAuth = ({ authService }: UseAuthOptions = {}) => {
  const { session } = useStore(authStore);

  const login = async (payload: LoginPayload): Promise<LoginResult> => {
    const resolvedAuthService = await resolveAuthService(authService);
    const result = await resolvedAuthService.login(payload);
    if (result.status === 'SIGNED_IN') {
      setSession(result.session);
    }

    return result;
  };

  const confirmLogin = async (code: string): Promise<LoginResult> => {
    const resolvedAuthService = await resolveAuthService(authService);
    const result = await resolvedAuthService.confirmLogin(code);
    if (result.status === 'SIGNED_IN') {
      setSession(result.session);
    }

    return result;
  };

  const register = async (payload: RegisterPayload): Promise<RegisterResult> => {
    const resolvedAuthService = await resolveAuthService(authService);
    return resolvedAuthService.register(payload);
  };

  const confirmSignUp = async (payload: ConfirmSignUpPayload): Promise<void> => {
    const resolvedAuthService = await resolveAuthService(authService);
    await resolvedAuthService.confirmSignUp(payload);
  };

  const resendSignUpCode = async (email: string): Promise<void> => {
    const resolvedAuthService = await resolveAuthService(authService);
    await resolvedAuthService.resendSignUpCode(email);
  };

  const logout = async (): Promise<void> => {
    const resolvedAuthService = await resolveAuthService(authService);
    await resolvedAuthService.logout();
    clearSession();
  };

  const forgotPassword = async (email: string): Promise<void> => {
    const resolvedAuthService = await resolveAuthService(authService);
    await resolvedAuthService.forgotPassword(email);
  };

  const confirmForgotPassword = async (
    payload: ConfirmResetPayload
  ): Promise<void> => {
    const resolvedAuthService = await resolveAuthService(authService);
    await resolvedAuthService.confirmForgotPassword(payload);
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<void> => {
    const resolvedAuthService = await resolveAuthService(authService);
    await resolvedAuthService.changePassword(currentPassword, newPassword);
  };

  return {
    session,
    isAuthenticated: Boolean(session),
    login,
    confirmLogin,
    register,
    confirmSignUp,
    resendSignUpCode,
    logout,
    forgotPassword,
    confirmForgotPassword,
    changePassword
  };
};
