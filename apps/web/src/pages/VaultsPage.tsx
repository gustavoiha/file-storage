import { RequireAuth } from '@/components/auth/RequireAuth';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { CreateVaultForm } from '@/components/files/CreateVaultForm';
import { VaultList } from '@/components/files/VaultList';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { useVaults } from '@/hooks/useVaults';
import { ApiError } from '@/lib/apiClient';

export const VaultsPage = () => {
  const vaults = useVaults();
  const unauthorized =
    vaults.error instanceof ApiError && vaults.error.statusCode === 403;

  return (
    <RequireAuth>
      <Page title="Vaults">
        {unauthorized ? (
          <UnauthorizedNotice />
        ) : (
          <>
            <Card title="Create Vault">
              <CreateVaultForm />
            </Card>
            <Card title="Your Vaults">
              {vaults.isLoading ? <p>Loading...</p> : <VaultList vaults={vaults.data ?? []} />}
            </Card>
          </>
        )}
      </Page>
    </RequireAuth>
  );
};
