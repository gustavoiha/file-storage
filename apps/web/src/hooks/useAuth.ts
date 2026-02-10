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
import { cognitoAuthService } from '@/lib/cognitoAuthService';

interface UseAuthOptions {
  authService?: AuthService;
}

export const useAuth = ({ authService = cognitoAuthService }: UseAuthOptions = {}) => {
  const { session } = useStore(authStore);

  const login = async (payload: LoginPayload): Promise<LoginResult> => {
    const result = await authService.login(payload);
    if (result.status === 'SIGNED_IN') {
      setSession(result.session);
    }

    return result;
  };

  const confirmLogin = async (code: string): Promise<LoginResult> => {
    const result = await authService.confirmLogin(code);
    if (result.status === 'SIGNED_IN') {
      setSession(result.session);
    }

    return result;
  };

  const register = async (payload: RegisterPayload): Promise<RegisterResult> => {
    return authService.register(payload);
  };

  const confirmSignUp = async (payload: ConfirmSignUpPayload): Promise<void> => {
    await authService.confirmSignUp(payload);
  };

  const resendSignUpCode = async (email: string): Promise<void> => {
    await authService.resendSignUpCode(email);
  };

  const logout = async (): Promise<void> => {
    await authService.logout();
    clearSession();
  };

  const forgotPassword = async (email: string): Promise<void> => {
    await authService.forgotPassword(email);
  };

  const confirmForgotPassword = async (
    payload: ConfirmResetPayload
  ): Promise<void> => {
    await authService.confirmForgotPassword(payload);
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<void> => {
    await authService.changePassword(currentPassword, newPassword);
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
