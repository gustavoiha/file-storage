import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { abortMultipartUpload, parseObjectKey } from '../lib/s3.js';

const bodySchema = z.object({
  objectKey: z.string().trim().min(3),
  uploadId: z.string().trim().min(1)
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

    await abortMultipartUpload(parsed.data.objectKey, parsed.data.uploadId);

    return jsonResponse(200, { aborted: true });
  } catch (error) {
    return errorResponse(error);
  }
};
