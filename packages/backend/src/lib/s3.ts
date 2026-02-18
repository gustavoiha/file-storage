import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectTaggingCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  PutObjectTaggingCommand,
  StorageClass,
  S3ServiceException,
  UploadPartCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from './clients.js';
import { env } from './env.js';

interface CreateDownloadUrlOptions {
  asAttachment?: boolean;
  fileName?: string;
}

const attachmentContentDisposition = (fileName?: string): string => {
  if (!fileName) {
    return 'attachment';
  }

  // Use RFC 5987 filename* to safely handle spaces and non-ASCII characters.
  const encoded = encodeURIComponent(fileName).replace(/\*/g, '%2A');
  return `attachment; filename*=UTF-8''${encoded}`;
};

export const buildObjectKey = (
  dockspaceId: string,
  fileNodeId: string
): string => `${dockspaceId}/${fileNodeId}`;

export const parseObjectKey = (
  dockspaceId: string,
  objectKey: string
): { fileNodeId: string } | null => {
  const prefix = `${dockspaceId}/`;
  if (!objectKey.startsWith(prefix)) {
    return null;
  }

  const fileNodeId = objectKey.slice(prefix.length).trim();
  if (!fileNodeId || fileNodeId.includes('/')) {
    return null;
  }

  return { fileNodeId };
};

export const createUploadUrl = async (
  key: string,
  contentType: string
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: env.bucketName,
    Key: key,
    ContentType: contentType,
    StorageClass: StorageClass.INTELLIGENT_TIERING
  });

  return getSignedUrl(s3Client, command, { expiresIn: 900 });
};

export const startMultipartUpload = async (key: string, contentType: string): Promise<string> => {
  const response = await s3Client.send(
    new CreateMultipartUploadCommand({
      Bucket: env.bucketName,
      Key: key,
      ContentType: contentType,
      StorageClass: StorageClass.INTELLIGENT_TIERING
    })
  );

  const uploadId = response.UploadId;
  if (!uploadId) {
    throw new Error('Failed to create multipart upload');
  }

  return uploadId;
};

export const createUploadPartUrl = async (
  key: string,
  uploadId: string,
  partNumber: number
): Promise<string> => {
  const command = new UploadPartCommand({
    Bucket: env.bucketName,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber
  });

  return getSignedUrl(s3Client, command, { expiresIn: 900 });
};

export const completeMultipartUpload = async (params: {
  key: string;
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
}): Promise<string | undefined> => {
  const response = await s3Client.send(
    new CompleteMultipartUploadCommand({
      Bucket: env.bucketName,
      Key: params.key,
      UploadId: params.uploadId,
      MultipartUpload: {
        Parts: params.parts.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag
        }))
      }
    })
  );

  return response.ETag;
};

export const abortMultipartUpload = async (key: string, uploadId: string): Promise<void> => {
  try {
    await s3Client.send(
      new AbortMultipartUploadCommand({
        Bucket: env.bucketName,
        Key: key,
        UploadId: uploadId
      })
    );
  } catch (error) {
    if (error instanceof S3ServiceException && error.name === 'NoSuchUpload') {
      return;
    }

    throw error;
  }
};

export const createDownloadUrl = async (
  key: string,
  options?: CreateDownloadUrlOptions
): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: env.bucketName,
    Key: key,
    ResponseContentDisposition: options?.asAttachment
      ? attachmentContentDisposition(options.fileName)
      : undefined
  });

  return getSignedUrl(s3Client, command, { expiresIn: 900 });
};

const toNodeReadable = (body: unknown): Readable | null => {
  if (body instanceof Readable) {
    return body;
  }

  if (
    body &&
    typeof body === 'object' &&
    Symbol.asyncIterator in body &&
    typeof (body as { [Symbol.asyncIterator]: unknown })[Symbol.asyncIterator] === 'function'
  ) {
    return Readable.from(body as AsyncIterable<Uint8Array>);
  }

  return null;
};

const readObjectBodyAsBytes = async (body: unknown, key: string): Promise<Uint8Array> => {
  const readable = toNodeReadable(body);
  if (readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of readable) {
      if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
        continue;
      }

      chunks.push(Buffer.from(String(chunk)));
    }

    return new Uint8Array(Buffer.concat(chunks));
  }

  const transformer = (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray;
  if (!transformer) {
    throw new Error(`Unable to read object body for key "${key}"`);
  }

  return await transformer.call(body);
};

export const computeObjectSha256Hex = async (key: string): Promise<string> => {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: env.bucketName,
      Key: key
    })
  );

  const body = response.Body;
  if (!body) {
    throw new Error(`Object body missing for key "${key}"`);
  }

  const hash = createHash('sha256');
  hash.update(await readObjectBodyAsBytes(body, key));
  return hash.digest('hex');
};

export const getObjectBytes = async (key: string): Promise<Uint8Array> => {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: env.bucketName,
      Key: key
    })
  );

  const body = response.Body;
  if (!body) {
    throw new Error(`Object body missing for key "${key}"`);
  }

  return readObjectBodyAsBytes(body, key);
};

export const putObjectBytes = async (params: {
  key: string;
  body: Uint8Array;
  contentType: string;
  cacheControl?: string;
}): Promise<void> => {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: env.bucketName,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      CacheControl: params.cacheControl,
      StorageClass: StorageClass.INTELLIGENT_TIERING
    })
  );
};

const normalizeEtagForObjectKey = (etag: string): string =>
  etag.replace(/"/g, '').replace(/[^A-Za-z0-9._-]/g, '_');

export const buildThumbnailObjectKey = (
  dockspaceId: string,
  fileNodeId: string,
  sourceEtag: string
): string =>
  `${dockspaceId}/thumbnails/${fileNodeId}/v-${normalizeEtagForObjectKey(sourceEtag)}.jpg`;

export const buildThumbnailObjectPrefix = (dockspaceId: string, fileNodeId: string): string =>
  `${dockspaceId}/thumbnails/${fileNodeId}/`;

export const deleteObjectIfExists = async (key: string): Promise<void> => {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: env.bucketName,
        Key: key
      })
    );
  } catch (error) {
    if (error instanceof S3ServiceException && error.name === 'NoSuchKey') {
      return;
    }

    throw error;
  }
};

export const objectExists = async (key: string): Promise<boolean> => {
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: env.bucketName,
        Key: key
      })
    );

    return true;
  } catch {
    return false;
  }
};

export const tagObjectTrash = async (key: string): Promise<void> => {
  await s3Client.send(
    new PutObjectTaggingCommand({
      Bucket: env.bucketName,
      Key: key,
      Tagging: {
        TagSet: [
          {
            Key: 'state',
            Value: 'TRASH'
          }
        ]
      }
    })
  );
};

export const clearTrashTag = async (key: string): Promise<void> => {
  const existing = await s3Client.send(
    new GetObjectTaggingCommand({
      Bucket: env.bucketName,
      Key: key
    })
  );

  const nextTagSet = (existing.TagSet ?? []).filter((tag) => tag.Key !== 'state');

  if (!nextTagSet.length) {
    await s3Client.send(
      new DeleteObjectTaggingCommand({
        Bucket: env.bucketName,
        Key: key
      })
    );
    return;
  }

  await s3Client.send(
    new PutObjectTaggingCommand({
      Bucket: env.bucketName,
      Key: key,
      Tagging: {
        TagSet: nextTagSet
      }
    })
  );
};

interface ObjectVersionRef {
  Key: string;
  VersionId?: string;
}

const listObjectVersionRefsByPrefix = async (
  prefix: string,
  include: (entryKey: string) => boolean
): Promise<ObjectVersionRef[]> => {
  const refs: ObjectVersionRef[] = [];
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await s3Client.send(
      new ListObjectVersionsCommand({
        Bucket: env.bucketName,
        Prefix: prefix,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker
      })
    );

    refs.push(
      ...(page.Versions ?? [])
        .filter((entry) => typeof entry.Key === 'string' && include(entry.Key))
        .map((entry) => ({
          Key: entry.Key as string,
          ...(entry.VersionId ? { VersionId: entry.VersionId } : {})
        }))
    );
    refs.push(
      ...(page.DeleteMarkers ?? [])
        .filter((entry) => typeof entry.Key === 'string' && include(entry.Key))
        .map((entry) => ({
          Key: entry.Key as string,
          ...(entry.VersionId ? { VersionId: entry.VersionId } : {})
        }))
    );

    keyMarker = page.NextKeyMarker;
    versionIdMarker = page.NextVersionIdMarker;
    hasMore = Boolean(page.IsTruncated);
  }

  return refs;
};

const listObjectVersionRefs = async (key: string): Promise<ObjectVersionRef[]> =>
  listObjectVersionRefsByPrefix(key, (entryKey) => entryKey === key);

const listObjectVersionRefsForPrefix = async (prefix: string): Promise<ObjectVersionRef[]> =>
  listObjectVersionRefsByPrefix(prefix, () => true);

const deleteObjectVersionRefs = async (refs: ObjectVersionRef[]): Promise<number> => {
  if (!refs.length) {
    return 0;
  }

  let deletedCount = 0;

  for (let index = 0; index < refs.length; index += 1000) {
    const batch = refs.slice(index, index + 1000);
    const response = await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: env.bucketName,
        Delete: {
          Objects: batch,
          Quiet: true
        }
      })
    );

    if ((response.Errors?.length ?? 0) > 0) {
      const firstError = response.Errors?.[0];
      throw new Error(
        `Failed to delete S3 object versions for key "${batch[0]?.Key ?? 'unknown'}"${firstError?.Code ? ` (${firstError.Code})` : ''}`
      );
    }

    deletedCount += response.Deleted?.length ?? batch.length;
  }

  return deletedCount;
};

export const objectHasAnyVersion = async (key: string): Promise<boolean> =>
  (await listObjectVersionRefs(key)).length > 0;

export interface PurgeObjectVersionsResult {
  discoveredVersionCount: number;
  deletedVersionCount: number;
  remainingVersionCount: number;
}

export const purgeObjectVersions = async (key: string): Promise<PurgeObjectVersionsResult> => {
  const discoveredRefs = await listObjectVersionRefs(key);
  const deletedVersionCount = await deleteObjectVersionRefs(discoveredRefs);
  const remainingVersionCount = (await listObjectVersionRefs(key)).length;

  return {
    discoveredVersionCount: discoveredRefs.length,
    deletedVersionCount,
    remainingVersionCount
  };
};

export const purgeObjectVersionsByPrefix = async (
  prefix: string
): Promise<PurgeObjectVersionsResult> => {
  const discoveredRefs = await listObjectVersionRefsForPrefix(prefix);
  const deletedVersionCount = await deleteObjectVersionRefs(discoveredRefs);
  const remainingVersionCount = (await listObjectVersionRefsForPrefix(prefix)).length;

  return {
    discoveredVersionCount: discoveredRefs.length,
    deletedVersionCount,
    remainingVersionCount
  };
};
