import { Store } from '@tanstack/store';
import type { AuthSession } from './authTypes';

const STORAGE_KEY = 'dockspace_auth_session';

export interface AuthState {
  session: AuthSession | null;
}

export const authStore = new Store<AuthState>({
  session: null
});

export const hydrateAuthStore = (): void => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw) as AuthSession;
    authStore.setState(() => ({ session: parsed }));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
};

export const setSession = (session: AuthSession): void => {
  authStore.setState(() => ({ session }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

export const clearSession = (): void => {
  authStore.setState(() => ({ session: null }));
  localStorage.removeItem(STORAGE_KEY);
};
