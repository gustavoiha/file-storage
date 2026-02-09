import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { requireEntitledUser } from '../lib/auth.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { listVaults } from '../lib/repository.js';

export const handler = async (event: APIGatewayProxyEventV2) => {
  try {
    const { userId } = requireEntitledUser(event);
    const vaults = await listVaults(userId);

    return jsonResponse(200, {
      items: vaults.map((vault) => ({
        vaultId: vault.vaultId,
        name: vault.name,
        createdAt: vault.createdAt
      }))
    });
  } catch (error) {
    return errorResponse(error);
  }
};
