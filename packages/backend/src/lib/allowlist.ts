import { GetParameterCommand } from '@aws-sdk/client-ssm';
import { ssmClient } from './clients.js';

const CACHE_TTL_MS = Number(process.env.ALLOWLIST_CACHE_TTL_MS ?? 60_000);

let cachedAllowlist: Set<string> | null = null;
let cacheExpiresAt = 0;

const getAllowlistParameterName = (): string => {
  const value = process.env.ALLOWLIST_SSM_PARAMETER_NAME;
  if (!value) {
    throw new Error('Missing required env var: ALLOWLIST_SSM_PARAMETER_NAME');
  }

  return value;
};

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const parseEmailStringList = (rawValue: string): Set<string> => {
  const entries = rawValue
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean);

  return new Set(entries);
};

export const resetAllowlistCache = (): void => {
  cachedAllowlist = null;
  cacheExpiresAt = 0;
};

export const getAllowlistEmails = async (): Promise<Set<string>> => {
  const now = Date.now();
  if (cachedAllowlist && cacheExpiresAt > now) {
    return cachedAllowlist;
  }

  const parameterName = getAllowlistParameterName();
  const response = await ssmClient.send(
    new GetParameterCommand({
      Name: parameterName
    })
  );

  const rawValue = response.Parameter?.Value?.trim() ?? '';
  const parsed = parseEmailStringList(rawValue);

  if (!parsed.size) {
    throw new Error('Allowlist parameter is empty');
  }

  cachedAllowlist = parsed;
  cacheExpiresAt = now + CACHE_TTL_MS;

  return parsed;
};

export const isEmailAllowed = async (email: string): Promise<boolean> => {
  const normalized = normalizeEmail(email);
  const allowlist = await getAllowlistEmails();

  return allowlist.has(normalized);
};
