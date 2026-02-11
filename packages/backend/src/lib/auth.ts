interface EventClaims {
  sub?: string;
  email?: string;
  email_verified?: string;
  'cognito:groups'?: string | string[];
  groups?: string | string[];
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
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: 401 | 403,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    if (context !== undefined) {
      this.context = context;
    }
  }
}

export const isAuthError = (error: unknown): error is AuthError =>
  error instanceof AuthError;

const parseGroupsFromString = (value: string): string[] => {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((entry): entry is string => typeof entry === 'string')
        .flatMap((entry) => parseGroupsFromString(entry));
    }

    if (typeof parsed === 'string') {
      return parseGroupsFromString(parsed);
    }
  } catch {
    // Fallback to non-JSON claim formats.
  }

  const withoutBrackets =
    trimmed.startsWith('[') && trimmed.endsWith(']')
      ? trimmed.slice(1, -1).trim()
      : trimmed;

  return withoutBrackets
    .split(',')
    .map((group) => group.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
};

const normalizeGroups = (rawGroups: string | string[] | undefined): string[] => {
  if (!rawGroups) {
    return [];
  }

  if (Array.isArray(rawGroups)) {
    return rawGroups.flatMap((group) => parseGroupsFromString(group));
  }

  return parseGroupsFromString(rawGroups);
};

export const getAuthIdentityFromEvent = (event: unknown): AuthIdentity => {
  const claims = (event as AuthorizerEvent).requestContext?.authorizer?.jwt?.claims;

  if (!claims) {
    throw new AuthError('Unauthenticated request', 401);
  }

  const userId = claims.sub;
  if (!userId) {
    throw new AuthError('Unauthenticated request', 401);
  }

  const identity: AuthIdentity = {
    userId,
    emailVerified: claims.email_verified === 'true',
    groups: normalizeGroups(claims['cognito:groups'] ?? claims.groups)
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
    throw new AuthError('Not authorized for this account', 403, {
      expectedGroup: entitledGroupName,
      tokenGroups: identity.groups,
      userId: identity.userId,
      email: identity.email ?? null
    });
  }

  return identity;
};

export const getUserIdFromEvent = (event: unknown): string =>
  getAuthIdentityFromEvent(event).userId;
