export const getUserIdFromEvent = (event: unknown): string => {
  const claims = (
    event as {
      requestContext?: {
        authorizer?: {
          jwt?: {
            claims?: Record<string, string | undefined>;
          };
        };
      };
    }
  ).requestContext?.authorizer?.jwt?.claims;
  const sub = claims?.sub ?? claims?.username;

  if (!sub) {
    throw new Error('Unauthenticated request');
  }

  return sub;
};
