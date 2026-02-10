import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { authStore, clearSession } from '@/lib/authStore';
import { useAuth } from '@/hooks/useAuth';

const authService = {
  login: vi.fn(async () => ({
    status: 'SIGNED_IN' as const,
    session: {
      accessToken: 'a',
      idToken: 'i',
      email: 'a@a.com',
      userId: 'u1'
    }
  })),
  confirmLogin: vi.fn(async () => ({
    status: 'SIGNED_IN' as const,
    session: {
      accessToken: 'a',
      idToken: 'i',
      email: 'a@a.com',
      userId: 'u1'
    }
  })),
  register: vi.fn(async () => ({
    status: 'REGISTERED' as const
  })),
  confirmSignUp: vi.fn(async () => {}),
  resendSignUpCode: vi.fn(async () => {}),
  logout: vi.fn(async () => {}),
  forgotPassword: vi.fn(async () => {}),
  confirmForgotPassword: vi.fn(async () => {}),
  changePassword: vi.fn(async () => {})
};

describe('useAuth', () => {
  it('login updates store', async () => {
    clearSession();

    const { result } = renderHook(() => useAuth({ authService }));

    await act(async () => {
      await result.current.login({ email: 'a@a.com', password: 'p' });
    });

    expect(authService.login).toHaveBeenCalled();
    expect(authStore.state.session?.userId).toBe('u1');
  });
});
