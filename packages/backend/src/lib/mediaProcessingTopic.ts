import { PublishCommand } from '@aws-sdk/client-sns';
import type { ThumbnailJob } from './thumbnailQueue.js';
import { snsClient } from './clients.js';

const getMediaProcessingTopicArn = (): string | null => {
  const value = process.env.MEDIA_PROCESSING_TOPIC_ARN?.trim();
  return value ? value : null;
};

const publishJsonMessage = async (params: { topicArn: string; payload: unknown }): Promise<void> => {
  await snsClient.send(
    new PublishCommand({
      TopicArn: params.topicArn,
      Message: JSON.stringify(params.payload)
    })
  );
};

export const publishMediaProcessingJob = async (
  job: ThumbnailJob,
  options?: { topicArn?: string }
): Promise<void> => {
  const topicArn = options?.topicArn ?? getMediaProcessingTopicArn();
  if (!topicArn) {
    throw new Error('MEDIA_PROCESSING_TOPIC_ARN is not configured');
  }

  await publishJsonMessage({
    topicArn,
    payload: job
  });
};

export const publishMediaProcessingJobIfConfigured = async (
  job: ThumbnailJob
): Promise<boolean> => {
  const topicArn = getMediaProcessingTopicArn();
  if (!topicArn) {
    return false;
  }

  await publishMediaProcessingJob(job, {
    topicArn
  });
  return true;
};
