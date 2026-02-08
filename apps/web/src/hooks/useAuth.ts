import { useStore } from '@tanstack/react-store';
import { authStore, clearSession, setSession } from '@/lib/authStore';
import type {
  AuthService,
  ConfirmResetPayload,
  LoginPayload,
  RegisterPayload
} from '@/lib/authTypes';
import { cognitoAuthService } from '@/lib/cognitoAuthService';

interface UseAuthOptions {
  authService?: AuthService;
}

export const useAuth = ({ authService = cognitoAuthService }: UseAuthOptions = {}) => {
  const { session } = useStore(authStore);

  const login = async (payload: LoginPayload): Promise<void> => {
    const nextSession = await authService.login(payload);
    setSession(nextSession);
  };

  const register = async (payload: RegisterPayload): Promise<void> => {
    await authService.register(payload);
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
    register,
    logout,
    forgotPassword,
    confirmForgotPassword,
    changePassword
  };
};
