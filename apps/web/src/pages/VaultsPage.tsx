import { RequireAuth } from '@/components/auth/RequireAuth';
import { CreateVaultForm } from '@/components/files/CreateVaultForm';
import { VaultList } from '@/components/files/VaultList';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { useVaults } from '@/hooks/useVaults';

export const VaultsPage = () => {
  const vaults = useVaults();

  return (
    <RequireAuth>
      <Page title="Vaults">
        <Card title="Create Vault">
          <CreateVaultForm />
        </Card>
        <Card title="Your Vaults">
          {vaults.isLoading ? <p>Loading...</p> : <VaultList vaults={vaults.data ?? []} />}
        </Card>
      </Page>
    </RequireAuth>
  );
};
