interface EventClaims {
  sub?: string;
  username?: string;
  email?: string;
  email_verified?: string;
  'cognito:groups'?: string | string[];
}

interface AuthorizerEvent {
  requestContext?: {
    authorizer?: {
      jwt?: {
        claims?: EventClaims;
      };
    };
  };
}

export interface AuthIdentity {
  userId: string;
  email?: string;
  emailVerified: boolean;
  groups: string[];
}

export class AuthError extends Error {
  public readonly statusCode: 401 | 403;

  constructor(message: string, statusCode: 401 | 403) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

export const isAuthError = (error: unknown): error is AuthError =>
  error instanceof AuthError;

const normalizeGroups = (rawGroups: string | string[] | undefined): string[] => {
  if (!rawGroups) {
    return [];
  }

  if (Array.isArray(rawGroups)) {
    return rawGroups.filter(Boolean).map((group) => group.trim()).filter(Boolean);
  }

  const trimmed = rawGroups.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((entry): entry is string => typeof entry === 'string')
          .map((group) => group.trim())
          .filter(Boolean);
      }
    } catch {
      // Fall back to comma-split parsing.
    }
  }

  return trimmed
    .split(',')
    .map((group) => group.trim())
    .filter(Boolean);
};

export const getAuthIdentityFromEvent = (event: unknown): AuthIdentity => {
  const claims = (event as AuthorizerEvent).requestContext?.authorizer?.jwt?.claims;

  if (!claims) {
    throw new AuthError('Unauthenticated request', 401);
  }

  const userId = claims.sub ?? claims.username;
  if (!userId) {
    throw new AuthError('Unauthenticated request', 401);
  }

  const identity: AuthIdentity = {
    userId,
    emailVerified: claims.email_verified === 'true',
    groups: normalizeGroups(claims['cognito:groups'])
  };

  if (claims.email) {
    identity.email = claims.email;
  }

  return identity;
};

const requiredEntitledGroupName = (): string => {
  const value = process.env.ENTITLED_GROUP_NAME;
  if (!value) {
    throw new Error('Missing required env var: ENTITLED_GROUP_NAME');
  }

  return value;
};

export const requireEntitledUser = (event: unknown): AuthIdentity => {
  const identity = getAuthIdentityFromEvent(event);
  const entitledGroupName = requiredEntitledGroupName();

  if (!identity.groups.includes(entitledGroupName)) {
    throw new AuthError('Not authorized for this account', 403);
  }

  return identity;
};

export const getUserIdFromEvent = (event: unknown): string =>
  getAuthIdentityFromEvent(event).userId;
