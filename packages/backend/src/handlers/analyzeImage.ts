import { GetParameterCommand } from '@aws-sdk/client-ssm';
import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';
import heicConvert from 'heic-convert';
import sharp from 'sharp';
import { z } from 'zod';
import { findFileNodeById, upsertImageAnalysisMetadata } from '../lib/repository.js';
import { getObjectBytes } from '../lib/s3.js';
import { ssmClient } from '../lib/clients.js';
import { fileStateFromNode } from '../types/models.js';

const TARGET_DIMENSION = 240;
const OPENAI_MODEL = 'gpt-4.1-nano';
const OPENAI_MAX_OUTPUT_TOKENS = 200;
const IMAGE_ANALYSIS_PROMPT = `Return one compact paragraph, 1 to 3 sentences, describing: subjects,
attributes, action, setting, and visual context. Include important visible text only when it
defines the overall context or identity of the image, such as a city name on a poster, a brand
name on a product, or a headline that clearly explains what the image is about. Do not try to
extract every piece of text, and do not list dense document-style text such as passports, forms,
or pages with many words. Mention only the few most context-defining words when they materially
improve retrieval. Use a consistent order, stay literal, and do not guess. Aim to keep the
response under 200 tokens. No bullets, no JSON, no extra commentary.`;

const imageAnalysisJobSchema = z.object({
  version: z.literal(1),
  userId: z.string().trim().min(1),
  dockspaceId: z.string().trim().min(1),
  fileNodeId: z.string().trim().min(1),
  s3Key: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  etag: z.string().trim().min(1),
  requestedAt: z.string().trim().min(1)
});

const imageAnalysisTextSchema = z.string().trim().min(1).max(2000);

interface PreparedRecord {
  record: SQSRecord;
  job: z.infer<typeof imageAnalysisJobSchema>;
  imageDataUrl: string;
}

let cachedOpenAiApiKey: string | null = null;

const parseJsonString = (value: string): unknown | null => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const isImageContentType = (contentType: string): boolean =>
  contentType.trim().toLowerCase().startsWith('image/');

const isAmbiguousBinaryContentType = (contentType: string): boolean => {
  const normalized = contentType.trim().toLowerCase();
  return (
    normalized === 'application/octet-stream' ||
    normalized === 'binary/octet-stream' ||
    normalized === 'application/x-octet-stream'
  );
};

const isHeicContentType = (contentType: string): boolean => {
  const normalized = contentType.trim().toLowerCase();
  return (
    normalized === 'image/heic' ||
    normalized === 'image/heif' ||
    normalized === 'image/heic-sequence' ||
    normalized === 'image/heif-sequence'
  );
};

const isLikelyHeicBytes = (sourceBytes: Uint8Array): boolean => {
  const header = Buffer.from(sourceBytes.subarray(0, 64)).toString('latin1').toLowerCase();
  return (
    header.includes('ftypheic') ||
    header.includes('ftypheix') ||
    header.includes('ftyphevc') ||
    header.includes('ftyphevx') ||
    header.includes('ftypheim') ||
    header.includes('ftypheis') ||
    header.includes('ftypmif1') ||
    header.includes('ftypmsf1')
  );
};

const convertImageToWebp = async (sourceBytes: Uint8Array): Promise<Uint8Array> => {
  const output = await sharp(sourceBytes, { failOn: 'none' })
    .rotate()
    .resize({
      width: TARGET_DIMENSION,
      height: TARGET_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({
      quality: 80
    })
    .toBuffer();

  return new Uint8Array(output);
};

const convertHeicToWebp = async (sourceBytes: Uint8Array): Promise<Uint8Array> => {
  const decoded = (await heicConvert({
    buffer: Buffer.from(sourceBytes),
    format: 'PNG',
    quality: 1
  })) as unknown;

  const pngBytes =
    decoded instanceof Uint8Array
      ? decoded
      : decoded instanceof ArrayBuffer
        ? new Uint8Array(decoded)
        : ArrayBuffer.isView(decoded)
          ? new Uint8Array(decoded.buffer, decoded.byteOffset, decoded.byteLength)
          : new Uint8Array(Buffer.from(decoded as Buffer));

  return convertImageToWebp(pngBytes);
};

const toWebpDataUrl = async (params: {
  sourceBytes: Uint8Array;
  contentType: string;
}): Promise<string> => {
  const webpBytes =
    isHeicContentType(params.contentType) || isLikelyHeicBytes(params.sourceBytes)
      ? await convertHeicToWebp(params.sourceBytes)
      : await convertImageToWebp(params.sourceBytes);

  return `data:image/webp;base64,${Buffer.from(webpBytes).toString('base64')}`;
};

const requiredEnv = (key: string): string => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }

  return value;
};

const getOpenAiApiKey = async (): Promise<string> => {
  if (cachedOpenAiApiKey) {
    return cachedOpenAiApiKey;
  }

  const response = await ssmClient.send(
    new GetParameterCommand({
      Name: requiredEnv('OPENAI_IMAGE_ANALYSIS_API_KEY_PARAMETER_NAME'),
      WithDecryption: true
    })
  );

  const apiKey = response.Parameter?.Value?.trim();
  if (!apiKey) {
    throw new Error('OPENAI API key parameter is empty');
  }

  cachedOpenAiApiKey = apiKey;
  return apiKey;
};

const extractOutputText = (responseBody: unknown): string => {
  if (!responseBody || typeof responseBody !== 'object') {
    throw new Error('OpenAI response body is invalid');
  }

  const status = (responseBody as { status?: unknown }).status;
  if (typeof status === 'string' && status !== 'completed') {
    const incompleteDetails = (responseBody as { incomplete_details?: unknown }).incomplete_details;
    throw new Error(
      `OpenAI response status was ${status}${
        incompleteDetails ? `: ${JSON.stringify(incompleteDetails).slice(0, 500)}` : ''
      }`
    );
  }

  const directParsed = (responseBody as { output_parsed?: unknown }).output_parsed;
  if (typeof directParsed === 'string' && directParsed.trim()) {
    return directParsed;
  }

  const directText = (responseBody as { output_text?: unknown }).output_text;
  if (typeof directText === 'string' && directText.trim()) {
    return directText;
  }

  const outputItems = (responseBody as { output?: unknown }).output;
  if (!Array.isArray(outputItems)) {
    throw new Error('OpenAI response did not include output items');
  }

  for (const item of outputItems) {
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (
        typeof (part as { type?: unknown }).type === 'string' &&
        ((part as { type: string }).type === 'refusal' ||
          (part as { type: string }).type === 'output_refusal')
      ) {
        const refusal =
          (part as { refusal?: unknown }).refusal ??
          (part as { text?: unknown }).text ??
          (part as { content?: unknown }).content;
        throw new Error(
          `OpenAI refused image analysis${
            typeof refusal === 'string' && refusal.trim() ? `: ${refusal.slice(0, 500)}` : ''
          }`
        );
      }

      const directJson = (part as { json?: unknown }).json;
      if (typeof directJson === 'string' && directJson.trim()) {
        return directJson;
      }

      const directParsedPart = (part as { parsed?: unknown }).parsed;
      if (typeof directParsedPart === 'string' && directParsedPart.trim()) {
        return directParsedPart;
      }

      if (
        (part as { type?: unknown }).type === 'output_text' &&
        typeof (part as { text?: unknown }).text === 'string'
      ) {
        return (part as { text: string }).text;
      }
    }
  }

  throw new Error(`OpenAI response did not include output text: ${JSON.stringify(responseBody).slice(0, 1000)}`);
};

const analyzeSingleImage = async (
  prepared: PreparedRecord
): Promise<string> => {
  const apiKey = await getOpenAiApiKey();
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: IMAGE_ANALYSIS_PROMPT
            },
            {
              type: 'input_image',
              image_url: prepared.imageDataUrl,
              detail: 'low'
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const bodyText = (await response.text()).slice(0, 1000);
    throw new Error(`OpenAI responses API request failed (${response.status}): ${bodyText}`);
  }

  const responseBody = (await response.json()) as unknown;
  const outputText = extractOutputText(responseBody);
  const parsed = imageAnalysisTextSchema.safeParse(outputText);
  if (!parsed.success) {
    throw new Error('OpenAI responses API returned invalid analysis text');
  }

  return parsed.data;
};

const prepareRecord = async (record: SQSRecord): Promise<PreparedRecord | null> => {
  const payload = parseJsonString(record.body);
  if (!payload) {
    throw new Error('Invalid SQS message body');
  }

  const parsed = imageAnalysisJobSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error('Invalid image analysis job payload');
  }

  const job = parsed.data;
  const fileNode = await findFileNodeById(job.userId, job.dockspaceId, job.fileNodeId);
  if (!fileNode || fileStateFromNode(fileNode) !== 'ACTIVE' || fileNode.etag !== job.etag) {
    return null;
  }

  const sourceBytes = await getObjectBytes(job.s3Key);
  if (
    !isImageContentType(job.contentType) &&
    !isHeicContentType(job.contentType) &&
    !(isAmbiguousBinaryContentType(job.contentType) && isLikelyHeicBytes(sourceBytes))
  ) {
    return null;
  }

  const imageDataUrl = await toWebpDataUrl({
    sourceBytes,
    contentType: job.contentType
  });

  return {
    record,
    job,
    imageDataUrl
  };
};

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];
  const preparedRecords: PreparedRecord[] = [];

  for (const record of event.Records) {
    try {
      const prepared = await prepareRecord(record);
      if (prepared) {
        preparedRecords.push(prepared);
      }
    } catch (error) {
      console.error('image-analysis:prepare-record-failed', {
        messageId: record.messageId,
        error: error instanceof Error ? error.message : String(error)
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  if (!preparedRecords.length) {
    return { batchItemFailures };
  }

  const settled = await Promise.allSettled(
    preparedRecords.map(async (prepared) => {
      let analysisText: string;
      try {
        analysisText = await analyzeSingleImage(prepared);
      } catch (error) {
        console.error('image-analysis:openai-call-failed', {
          messageId: prepared.record.messageId,
          fileNodeId: prepared.job.fileNodeId,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }

      const nowIso = new Date().toISOString();
      try {
        await upsertImageAnalysisMetadata({
          userId: prepared.job.userId,
          dockspaceId: prepared.job.dockspaceId,
          fileNodeId: prepared.job.fileNodeId,
          sourceS3Key: prepared.job.s3Key,
          sourceEtag: prepared.job.etag,
          sourceContentType: prepared.job.contentType,
          analysisText,
          analyzedAt: nowIso,
          nowIso
        });
      } catch (error) {
        console.error('image-analysis:metadata-upsert-failed', {
          messageId: prepared.record.messageId,
          fileNodeId: prepared.job.fileNodeId,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    })
  );

  for (let index = 0; index < settled.length; index += 1) {
    if (settled[index]?.status === 'rejected') {
      batchItemFailures.push({ itemIdentifier: preparedRecords[index]!.record.messageId });
    }
  }

  return { batchItemFailures };
};
