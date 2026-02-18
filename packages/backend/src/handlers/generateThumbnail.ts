import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SQSEvent, SQSRecord } from 'aws-lambda';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import { z } from 'zod';
import {
  findFileNodeById,
  getThumbnailMetadata,
  upsertThumbnailMetadata
} from '../lib/repository.js';
import { buildThumbnailObjectKey, getObjectBytes, putObjectBytes } from '../lib/s3.js';
import {
  buildThumbnailJob,
  enqueueThumbnailFailureToDlq,
  enqueueThumbnailJob
} from '../lib/thumbnailQueue.js';
import { fileStateFromNode } from '../types/models.js';

const MAX_THUMBNAIL_DIMENSION = 512;
const BASE_RETRY_DELAY_SECONDS = 30;
const DEFAULT_MAX_ATTEMPTS = 8;

const thumbnailJobSchema = z.object({
  version: z.literal(1),
  jobType: z.literal('GENERATE_THUMBNAIL'),
  userId: z.string().trim().min(1),
  dockspaceId: z.string().trim().min(1),
  fileNodeId: z.string().trim().min(1),
  s3Key: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  etag: z.string().trim().min(1),
  attempt: z.number().int().min(1),
  requestedAt: z.string().trim().min(1)
});

class NonRetryableThumbnailError extends Error {}

const maxAttempts = (): number => {
  const parsed = Number.parseInt(process.env.THUMBNAIL_MAX_ATTEMPTS ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_MAX_ATTEMPTS;
  }

  return parsed;
};

const computeRetryDelaySeconds = (attempt: number): number =>
  Math.min(900, Math.max(1, (2 ** Math.max(0, attempt - 1)) * BASE_RETRY_DELAY_SECONDS));

const truncatedErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1000);
};

const isRetryableError = (error: unknown): boolean => {
  if (error instanceof NonRetryableThumbnailError) {
    return false;
  }

  if (!(error instanceof Error)) {
    return true;
  }

  const retryableNames = new Set([
    'InternalError',
    'InternalServerError',
    'RequestTimeout',
    'Throttling',
    'ThrottlingException',
    'TooManyRequestsException'
  ]);
  if (retryableNames.has(error.name)) {
    return true;
  }

  const message = error.message.toLowerCase();
  if (message.includes('no such key') || message.includes('nosuchkey')) {
    return false;
  }

  if (
    message.includes('timeout') ||
    message.includes('throttle') ||
    message.includes('too many requests') ||
    message.includes('temporar')
  ) {
    return true;
  }

  return true;
};

const createImageThumbnail = async (
  sourceBytes: Uint8Array
): Promise<{ bytes: Uint8Array; width?: number; height?: number; size: number; contentType: string }> => {
  try {
    const { data, info } = await sharp(sourceBytes, { failOn: 'none' })
      .rotate()
      .resize({
        width: MAX_THUMBNAIL_DIMENSION,
        height: MAX_THUMBNAIL_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({
        quality: 80,
        mozjpeg: true
      })
      .toBuffer({ resolveWithObject: true });

    return {
      bytes: new Uint8Array(data),
      size: info.size,
      contentType: 'image/jpeg',
      ...(typeof info.width === 'number' ? { width: info.width } : {}),
      ...(typeof info.height === 'number' ? { height: info.height } : {})
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('unsupported image format') || message.includes('input buffer')) {
      throw new NonRetryableThumbnailError('Unable to decode source image');
    }

    throw error;
  }
};

const contentTypeExtension = (contentType: string): string => {
  const normalized = contentType.toLowerCase();
  if (normalized === 'video/mp4') {
    return 'mp4';
  }

  if (normalized === 'video/quicktime') {
    return 'mov';
  }

  if (normalized === 'video/webm') {
    return 'webm';
  }

  if (normalized === 'video/x-matroska') {
    return 'mkv';
  }

  return 'bin';
};

const runFfmpeg = async (args: string[]): Promise<void> =>
  await new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new NonRetryableThumbnailError('Video thumbnail extraction is unavailable'));
      return;
    }

    const child = spawn(ffmpegPath, args, {
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';

    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const message = `ffmpeg exited with code ${code ?? 'unknown'}${stderr ? `: ${stderr}` : ''}`;
      reject(new Error(message));
    });
  });

const createVideoThumbnail = async (params: {
  sourceBytes: Uint8Array;
  contentType: string;
}): Promise<{ bytes: Uint8Array; width?: number; height?: number; size: number; contentType: string }> => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'thumbnail-video-'));
  const inputPath = path.join(tempRoot, `input.${contentTypeExtension(params.contentType)}`);
  const outputPath = path.join(tempRoot, 'frame.jpg');

  try {
    await writeFile(inputPath, params.sourceBytes);
    await runFfmpeg([
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      '1',
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-q:v',
      '2',
      '-y',
      outputPath
    ]);

    const frameBytes = await readFile(outputPath);
    return createImageThumbnail(new Uint8Array(frameBytes));
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (
      message.includes('invalid data found') ||
      message.includes('unsupported') ||
      message.includes('could not find codec parameters')
    ) {
      throw new NonRetryableThumbnailError('Unable to decode source video');
    }

    throw error;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
};

const persistFailedStatusIfCurrent = async (
  job: z.infer<typeof thumbnailJobSchema>,
  message: string
): Promise<void> => {
  const fileNode = await findFileNodeById(job.userId, job.dockspaceId, job.fileNodeId);
  if (!fileNode || fileStateFromNode(fileNode) !== 'ACTIVE' || fileNode.etag !== job.etag) {
    return;
  }

  const nowIso = new Date().toISOString();
  await upsertThumbnailMetadata({
    userId: job.userId,
    dockspaceId: job.dockspaceId,
    fileNodeId: job.fileNodeId,
    sourceS3Key: job.s3Key,
    sourceEtag: job.etag,
    sourceContentType: job.contentType,
    status: 'FAILED',
    attempts: job.attempt,
    lastError: message,
    nowIso
  });
};

const processThumbnailJob = async (job: z.infer<typeof thumbnailJobSchema>): Promise<void> => {
  const nowIso = new Date().toISOString();
  const fileNode = await findFileNodeById(job.userId, job.dockspaceId, job.fileNodeId);
  if (!fileNode || fileStateFromNode(fileNode) !== 'ACTIVE') {
    return;
  }

  if (fileNode.etag !== job.etag) {
    return;
  }

  const existing = await getThumbnailMetadata(job.userId, job.dockspaceId, job.fileNodeId);
  if (
    existing?.sourceEtag === job.etag &&
    (existing.status === 'READY' || existing.status === 'UNSUPPORTED')
  ) {
    return;
  }

  const normalizedContentType = job.contentType.trim().toLowerCase();
  if (!normalizedContentType.startsWith('image/') && !normalizedContentType.startsWith('video/')) {
    await upsertThumbnailMetadata({
      userId: job.userId,
      dockspaceId: job.dockspaceId,
      fileNodeId: job.fileNodeId,
      sourceS3Key: job.s3Key,
      sourceEtag: job.etag,
      sourceContentType: job.contentType,
      status: 'UNSUPPORTED',
      attempts: job.attempt,
      nowIso
    });
    return;
  }

  const sourceBytes = await getObjectBytes(job.s3Key);
  const thumbnail = normalizedContentType.startsWith('video/')
    ? await createVideoThumbnail({
        sourceBytes,
        contentType: normalizedContentType
      })
    : await createImageThumbnail(sourceBytes);
  const thumbnailKey = buildThumbnailObjectKey(job.dockspaceId, job.fileNodeId, job.etag);

  await putObjectBytes({
    key: thumbnailKey,
    body: thumbnail.bytes,
    contentType: thumbnail.contentType,
    cacheControl: 'public, max-age=31536000, immutable'
  });

  await upsertThumbnailMetadata({
    userId: job.userId,
    dockspaceId: job.dockspaceId,
    fileNodeId: job.fileNodeId,
    sourceS3Key: job.s3Key,
    sourceEtag: job.etag,
    sourceContentType: job.contentType,
    status: 'READY',
    attempts: job.attempt,
    thumbnailKey,
    thumbnailContentType: thumbnail.contentType,
    size: thumbnail.size,
    generatedAt: nowIso,
    ...(typeof thumbnail.width === 'number' ? { width: thumbnail.width } : {}),
    ...(typeof thumbnail.height === 'number' ? { height: thumbnail.height } : {}),
    nowIso
  });
};

const handleRecord = async (record: SQSRecord): Promise<void> => {
  const jsonPayload = (() => {
    try {
      return JSON.parse(record.body);
    } catch {
      return null;
    }
  })();

  if (!jsonPayload) {
    await enqueueThumbnailFailureToDlq({
      reason: 'INVALID_JSON',
      messageId: record.messageId,
      body: record.body,
      failedAt: new Date().toISOString()
    });
    return;
  }

  const parsed = thumbnailJobSchema.safeParse(jsonPayload);
  if (!parsed.success) {
    await enqueueThumbnailFailureToDlq({
      reason: 'INVALID_PAYLOAD',
      messageId: record.messageId,
      body: record.body,
      issues: parsed.error.issues,
      failedAt: new Date().toISOString()
    });
    return;
  }

  const job = parsed.data;

  try {
    await processThumbnailJob(job);
  } catch (error) {
    const retryable = isRetryableError(error);
    const errorMessage = truncatedErrorMessage(error);

    if (retryable && job.attempt < maxAttempts()) {
      const nextAttempt = job.attempt + 1;
      await enqueueThumbnailJob(
        buildThumbnailJob({
          userId: job.userId,
          dockspaceId: job.dockspaceId,
          fileNodeId: job.fileNodeId,
          s3Key: job.s3Key,
          contentType: job.contentType,
          etag: job.etag,
          attempt: nextAttempt,
          requestedAt: new Date().toISOString()
        }),
        {
          delaySeconds: computeRetryDelaySeconds(job.attempt)
        }
      );
      return;
    }

    await persistFailedStatusIfCurrent(job, errorMessage);
    await enqueueThumbnailFailureToDlq({
      reason: retryable ? 'MAX_ATTEMPTS_EXCEEDED' : 'NON_RETRYABLE_FAILURE',
      messageId: record.messageId,
      job,
      error: errorMessage,
      failedAt: new Date().toISOString()
    });
  }
};

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    await handleRecord(record);
  }
};
