import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { sqsClient } from './clients.js';

export interface ThumbnailJob {
  version: 1;
  jobType: 'GENERATE_THUMBNAIL';
  userId: string;
  dockspaceId: string;
  fileNodeId: string;
  s3Key: string;
  contentType: string;
  etag: string;
  attempt: number;
  requestedAt: string;
}

export interface ThumbnailJobInput {
  userId: string;
  dockspaceId: string;
  fileNodeId: string;
  s3Key: string;
  contentType: string;
  etag: string;
  attempt?: number;
  requestedAt?: string;
}

const getThumbnailQueueUrl = (): string | null => {
  const value = process.env.THUMBNAIL_QUEUE_URL?.trim();
  return value ? value : null;
};

const getThumbnailDlqUrl = (): string | null => {
  const value = process.env.THUMBNAIL_DLQ_URL?.trim();
  return value ? value : null;
};

const clampDelaySeconds = (delaySeconds?: number): number | undefined => {
  if (typeof delaySeconds !== 'number') {
    return undefined;
  }

  if (!Number.isFinite(delaySeconds)) {
    return undefined;
  }

  const rounded = Math.floor(delaySeconds);
  if (rounded <= 0) {
    return undefined;
  }

  return Math.min(rounded, 900);
};

export const buildThumbnailJob = (input: ThumbnailJobInput): ThumbnailJob => ({
  version: 1,
  jobType: 'GENERATE_THUMBNAIL',
  userId: input.userId,
  dockspaceId: input.dockspaceId,
  fileNodeId: input.fileNodeId,
  s3Key: input.s3Key,
  contentType: input.contentType,
  etag: input.etag,
  attempt: input.attempt ?? 1,
  requestedAt: input.requestedAt ?? new Date().toISOString()
});

const sendJsonMessage = async (params: {
  queueUrl: string;
  payload: unknown;
  delaySeconds?: number;
}): Promise<void> => {
  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: params.queueUrl,
      MessageBody: JSON.stringify(params.payload),
      DelaySeconds: clampDelaySeconds(params.delaySeconds)
    })
  );
};

export const enqueueThumbnailJob = async (
  job: ThumbnailJob,
  options?: { queueUrl?: string; delaySeconds?: number }
): Promise<void> => {
  const queueUrl = options?.queueUrl ?? getThumbnailQueueUrl();
  if (!queueUrl) {
    throw new Error('THUMBNAIL_QUEUE_URL is not configured');
  }

  await sendJsonMessage({
    queueUrl,
    payload: job,
    ...(typeof options?.delaySeconds === 'number'
      ? { delaySeconds: options.delaySeconds }
      : {})
  });
};

export const enqueueThumbnailJobIfConfigured = async (
  job: ThumbnailJob,
  options?: { delaySeconds?: number }
): Promise<boolean> => {
  const queueUrl = getThumbnailQueueUrl();
  if (!queueUrl) {
    return false;
  }

  await enqueueThumbnailJob(job, {
    queueUrl,
    ...(typeof options?.delaySeconds === 'number'
      ? { delaySeconds: options.delaySeconds }
      : {})
  });
  return true;
};

export const enqueueThumbnailFailureToDlq = async (payload: unknown): Promise<void> => {
  const queueUrl = getThumbnailDlqUrl();
  if (!queueUrl) {
    throw new Error('THUMBNAIL_DLQ_URL is not configured');
  }

  await sendJsonMessage({
    queueUrl,
    payload
  });
};
