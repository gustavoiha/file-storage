import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse, safeJsonParse } from '../lib/http.js';
import { putDockspaceWithRootFolder } from '../lib/repository.js';
import { buildDockspacePk, buildDockspaceSk } from '../domain/keys.js';
import { DEFAULT_DOCKSPACE_TYPE, DOCKSPACE_TYPES } from '../types/models.js';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  dockspaceType: z.enum(DOCKSPACE_TYPES).optional()
});

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const parsed = bodySchema.safeParse(safeJsonParse(event.body));

    if (!parsed.success) {
      return jsonResponse(400, { error: 'Invalid request body' });
    }

    const now = new Date().toISOString();
    const dockspaceId = randomUUID();
    const dockspaceType = parsed.data.dockspaceType ?? DEFAULT_DOCKSPACE_TYPE;

    await putDockspaceWithRootFolder(
      {
        PK: buildDockspacePk(userId),
        SK: buildDockspaceSk(dockspaceId),
        type: 'DOCKSPACE',
        userId,
        dockspaceId,
        name: parsed.data.name,
        dockspaceType,
        createdAt: now
      },
      now
    );

    return jsonResponse(201, {
      dockspaceId,
      name: parsed.data.name,
      dockspaceType,
      createdAt: now,
      totalFileCount: 0,
      totalSizeBytes: 0
    });
  } catch (error) {
    return errorResponse(error);
  }
};
