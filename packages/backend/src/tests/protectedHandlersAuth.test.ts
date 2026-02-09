import { beforeEach, describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const baseEvent = (): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: 'POST /vaults',
    rawPath: '/vaults',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api-id',
      domainName: 'example.com',
      domainPrefix: 'example',
      http: {
        method: 'POST',
        path: '/vaults',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'request-id',
      routeKey: 'POST /vaults',
      stage: '$default',
      time: '',
      timeEpoch: 0
    },
    isBase64Encoded: false,
    body: JSON.stringify({ name: 'test-vault' })
  }) as APIGatewayProxyEventV2;

describe('protected handlers auth behavior', () => {
  beforeEach(() => {
    process.env.TABLE_NAME = 'table';
    process.env.BUCKET_NAME = 'bucket';
    process.env.ENTITLED_GROUP_NAME = 'entitled-users';
  });

  it('returns 401 when claims are missing', async () => {
    const { handler } = await import('../handlers/createVault.js');
    const response = await handler(baseEvent());

    expect(response.statusCode).toBe(401);
  });

  it('returns 403 when user lacks entitlement group', async () => {
    const { handler } = await import('../handlers/createVault.js');

    const response = await handler({
      ...baseEvent(),
      requestContext: {
        ...baseEvent().requestContext,
        authorizer: {
          jwt: {
            claims: {
              sub: 'user-1',
              'cognito:groups': ['other-group']
            }
          }
        }
      }
    } as APIGatewayProxyEventV2);

    expect(response.statusCode).toBe(403);
  });
});
