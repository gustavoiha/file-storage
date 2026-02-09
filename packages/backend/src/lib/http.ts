import { isAuthError } from './auth.js';

export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export const jsonResponse = (
  statusCode: number,
  body: Record<string, unknown>
): HttpResponse => ({
  statusCode,
  headers: {
    'content-type': 'application/json'
  },
  body: JSON.stringify(body)
});

export const safeJsonParse = <T>(rawBody: string | null | undefined): T | null => {
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    return null;
  }
};

export const isoPlusDays = (isoString: string, days: number): string => {
  const base = new Date(isoString);
  const next = new Date(base.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
};

export const errorResponse = (error: unknown): HttpResponse => {
  if (isAuthError(error)) {
    return jsonResponse(error.statusCode, {
      error: error.message
    });
  }

  return jsonResponse(500, {
    error: error instanceof Error ? error.message : 'Unknown error'
  });
};
