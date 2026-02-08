import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getUserIdFromEvent } from '../lib/auth.js';
import { jsonResponse } from '../lib/http.js';
import { listVaults } from '../lib/repository.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const userId = getUserIdFromEvent(event);
    const vaults = await listVaults(userId);

    return jsonResponse(200, {
      items: vaults.map((vault) => ({
        vaultId: vault.vaultId,
        name: vault.name,
        createdAt: vault.createdAt
      }))
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
