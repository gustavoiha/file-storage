import { describe, expect, it, beforeEach } from 'vitest';
import {
  AuthError,
  getAuthIdentityFromEvent,
  requireEntitledUser
} from '../lib/auth.js';

const withClaims = (claims: Record<string, unknown>) => ({
  requestContext: {
    authorizer: {
      jwt: {
        claims
      }
    }
  }
});

describe('auth identity and entitlement guard', () => {
  beforeEach(() => {
    process.env.ENTITLED_GROUP_NAME = 'entitled-users';
  });

  it('throws 401 for missing claims', () => {
    expect(() => requireEntitledUser({})).toThrow(AuthError);

    try {
      requireEntitledUser({});
    } catch (error) {
      expect((error as AuthError).statusCode).toBe(401);
    }
  });

  it('extracts identity from claims', () => {
    const identity = getAuthIdentityFromEvent(
      withClaims({
        sub: 'user-1',
        email: 'a@a.com',
        email_verified: 'true',
        'cognito:groups': ['entitled-users']
      })
    );

    expect(identity).toEqual({
      userId: 'user-1',
      email: 'a@a.com',
      emailVerified: true,
      groups: ['entitled-users']
    });
  });

  it('throws 403 when user is not in entitled group', () => {
    expect(() =>
      requireEntitledUser(
        withClaims({
          sub: 'user-1',
          'cognito:groups': ['other-group']
        })
      )
    ).toThrow(AuthError);

    try {
      requireEntitledUser(
        withClaims({
          sub: 'user-1',
          'cognito:groups': ['other-group']
        })
      );
    } catch (error) {
      expect((error as AuthError).statusCode).toBe(403);
    }
  });

  it('supports comma-separated group claim format', () => {
    const identity = requireEntitledUser(
      withClaims({
        sub: 'user-1',
        'cognito:groups': 'other-group, entitled-users'
      })
    );

    expect(identity.userId).toBe('user-1');
  });
});
