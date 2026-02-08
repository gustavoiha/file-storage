import { env } from './env';
import { authStore } from './authStore';

export class ApiError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

const getAccessToken = (): string => {
  const session = authStore.state.session;
  if (!session) {
    throw new ApiError('Not authenticated', 401);
  }

  return session.accessToken;
};

export const apiRequest = async <T>(
  path: string,
  init?: RequestInit,
  authenticated = true
): Promise<T> => {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');

  if (authenticated) {
    headers.set('authorization', `Bearer ${getAccessToken()}`);
  }

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    headers
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };

  if (!response.ok) {
    throw new ApiError(payload.error ?? 'Request failed', response.status);
  }

  return payload as T;
};
