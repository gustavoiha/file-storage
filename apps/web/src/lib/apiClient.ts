import { fetchAuthSession } from 'aws-amplify/auth';
import { configureAmplify } from './amplify';
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

const decodeJwtPayload = (jwt: string): Record<string, unknown> | null => {
  const parts = jwt.split('.');
  const payloadPart = parts[1];
  if (!payloadPart) {
    return null;
  }

  try {
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const tokenContainsGroupsClaim = (jwt?: string): boolean => {
  if (!jwt) {
    return false;
  }

  const payload = decodeJwtPayload(jwt);
  if (!payload) {
    return false;
  }

  return Boolean(payload['cognito:groups'] ?? payload.groups);
};

const selectBearerToken = (idToken?: string, accessToken?: string): string | null => {
  if (tokenContainsGroupsClaim(idToken)) {
    return idToken ?? null;
  }

  if (tokenContainsGroupsClaim(accessToken)) {
    return accessToken ?? null;
  }

  return accessToken ?? idToken ?? null;
};

const getAuthToken = async (forceRefresh = false): Promise<string> => {
  configureAmplify();

  const session = await fetchAuthSession({ forceRefresh });
  const idToken = session.tokens?.idToken?.toString();
  const accessToken = session.tokens?.accessToken?.toString();
  const selected = selectBearerToken(idToken, accessToken);

  if (selected) {
    return selected;
  }

  const storedSession = authStore.state.session;
  if (storedSession) {
    return storedSession.accessToken;
  }

  throw new ApiError('Not authenticated', 401);
};

export const apiRequest = async <T>(
  path: string,
  init?: RequestInit,
  authenticated = true
): Promise<T> => {
  const executeRequest = async (forceRefresh = false): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set('content-type', 'application/json');

    if (authenticated) {
      headers.set('authorization', `Bearer ${await getAuthToken(forceRefresh)}`);
    }

    return fetch(`${env.apiBaseUrl}${path}`, {
      ...init,
      headers
    });
  };

  let response = await executeRequest();

  if (authenticated && response.status === 403) {
    const firstPayload = (await response.clone().json().catch(() => ({}))) as {
      error?: string;
    };

    if (firstPayload.error === 'Not authorized for this account') {
      response = await executeRequest(true);
    }
  }

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };

  if (!response.ok) {
    throw new ApiError(payload.error ?? 'Request failed', response.status);
  }

  return payload as T;
};
