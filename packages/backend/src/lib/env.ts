const requiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }

  return value;
};

export const env = {
  tableName: requiredEnv('TABLE_NAME'),
  bucketName: requiredEnv('BUCKET_NAME'),
  trashRetentionDays: Number(process.env.TRASH_RETENTION_DAYS ?? 30)
};
