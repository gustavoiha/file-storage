import { createSign } from 'node:crypto';
import { GetParameterCommand } from '@aws-sdk/client-ssm';
import { ssmClient } from './clients.js';

interface CreateFileReadUrlOptions {
  expiresInSeconds?: number;
  asAttachment?: boolean;
  fileName?: string;
}

const DEFAULT_EXPIRES_IN_SECONDS = 900;

let cachedPrivateKey: string | null = null;
let privateKeyPromise: Promise<string> | null = null;

const requiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }

  return value;
};

const encodePath = (objectKey: string): string =>
  objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const cloudFrontSafeBase64 = (value: string): string =>
  value.replace(/\+/g, '-').replace(/=/g, '_').replace(/\//g, '~');

const attachmentContentDisposition = (fileName?: string): string => {
  if (!fileName) {
    return 'attachment';
  }

  const encoded = encodeURIComponent(fileName).replace(/\*/g, '%2A');
  return `attachment; filename*=UTF-8''${encoded}`;
};

const loadPrivateKey = async (): Promise<string> => {
  if (cachedPrivateKey) {
    return cachedPrivateKey;
  }

  if (!privateKeyPromise) {
    privateKeyPromise = (async () => {
      try {
        const parameterName = requiredEnv('FILE_READ_PRIVATE_KEY_PARAMETER_NAME');
        const response = await ssmClient.send(
          new GetParameterCommand({
            Name: parameterName,
            WithDecryption: true
          })
        );

        const privateKey = response.Parameter?.Value?.trim();
        if (!privateKey) {
          throw new Error(
            `CloudFront private key parameter "${parameterName}" is empty or missing`
          );
        }

        const normalized = privateKey.replace(/\\n/g, '\n');
        cachedPrivateKey = normalized;
        return normalized;
      } catch (error) {
        privateKeyPromise = null;
        throw error;
      }
    })();
  }

  return privateKeyPromise;
};

const buildCannedPolicy = (resourceUrl: string, expiresAtEpochSeconds: number): string =>
  JSON.stringify({
    Statement: [
      {
        Resource: resourceUrl,
        Condition: {
          DateLessThan: {
            'AWS:EpochTime': expiresAtEpochSeconds
          }
        }
      }
    ]
  });

export const createFileReadUrl = async (
  objectKey: string,
  options?: CreateFileReadUrlOptions
): Promise<{ url: string; expiresInSeconds: number }> => {
  const normalizedObjectKey = objectKey.trim().replace(/^\/+/, '');
  if (!normalizedObjectKey) {
    throw new Error('objectKey is required');
  }

  const domainName = requiredEnv('FILE_READ_DOMAIN_NAME').trim().replace(/^https?:\/\//, '');
  const keyPairId = requiredEnv('FILE_READ_KEY_PAIR_ID').trim();
  const expiresInSeconds = Math.max(1, options?.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS);
  const expiresAtEpochSeconds = Math.floor(Date.now() / 1000) + expiresInSeconds;

  const url = new URL(`https://${domainName}/${encodePath(normalizedObjectKey)}`);
  if (options?.asAttachment) {
    url.searchParams.set(
      'response-content-disposition',
      attachmentContentDisposition(options.fileName)
    );
  }

  const resource = url.toString();
  const privateKey = await loadPrivateKey();
  const signer = createSign('RSA-SHA1');
  signer.update(buildCannedPolicy(resource, expiresAtEpochSeconds));
  signer.end();

  const signature = signer.sign(privateKey, 'base64');
  url.searchParams.set('Expires', String(expiresAtEpochSeconds));
  url.searchParams.set('Signature', cloudFrontSafeBase64(signature));
  url.searchParams.set('Key-Pair-Id', keyPairId);

  return {
    url: url.toString(),
    expiresInSeconds
  };
};
