import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectTaggingCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
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
