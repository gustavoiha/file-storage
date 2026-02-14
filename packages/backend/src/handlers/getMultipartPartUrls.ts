import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { createUploadPartUrl, parseObjectKey } from '../lib/s3.js';

const MAX_MULTIPART_PARTS = 10_000;
const URL_EXPIRES_IN_SECONDS = 900;

const bodySchema = z.object({
  objectKey: z.string().trim().min(3),
  uploadId: z.string().trim().min(1),
  partNumbers: z.array(z.number().int().min(1).max(MAX_MULTIPART_PARTS)).min(1).max(500)
});

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    requireEntitledUser(event);
    const dockspaceId = event.pathParameters?.dockspaceId;

    if (!dockspaceId) {
      return jsonResponse(400, { error: 'dockspaceId is required' });
    }

    const parsed = bodySchema.safeParse(safeJsonParse(event.body));
    if (!parsed.success) {
      return jsonResponse(400, { error: 'Invalid request body' });
    }

    if (!parseObjectKey(dockspaceId, parsed.data.objectKey)) {
      return jsonResponse(400, { error: 'Invalid objectKey' });
    }

    const sortedPartNumbers = parsed.data.partNumbers.slice().sort((left, right) => left - right);
    for (let index = 1; index < sortedPartNumbers.length; index += 1) {
      if (sortedPartNumbers[index] === sortedPartNumbers[index - 1]) {
        return jsonResponse(400, { error: 'partNumbers must be unique' });
      }
    }

    const urls = await Promise.all(
      sortedPartNumbers.map(async (partNumber) => ({
        partNumber,
        uploadUrl: await createUploadPartUrl(parsed.data.objectKey, parsed.data.uploadId, partNumber),
        expiresInSeconds: URL_EXPIRES_IN_SECONDS
      }))
    );

    return jsonResponse(200, { urls });
  } catch (error) {
    return errorResponse(error);
  }
};
