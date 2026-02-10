import { useEffect, useRef } from 'react';
import { useStore } from '@tanstack/react-store';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { CreateVaultForm } from '@/components/files/CreateVaultForm';
import { VaultList } from '@/components/files/VaultList';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { useCreateVault, useVaults } from '@/hooks/useVaults';
import { ApiError } from '@/lib/apiClient';
import { authStore } from '@/lib/authStore';

const getEmailPrefix = (email: string): string => {
  const atIndex = email.indexOf('@');

  if (atIndex <= 0) {
    return 'vault';
  }

  return email.slice(0, atIndex).trim() || 'vault';
};

export const VaultsPage = () => {
  const vaults = useVaults();
  const createFirstVault = useCreateVault();
  const { session } = useStore(authStore);
  const autoCreateAttemptedRef = useRef(false);
  const firstVaultName = getEmailPrefix(session?.email ?? '');
  const unauthorized =
    vaults.error instanceof ApiError && vaults.error.statusCode === 403;
  const isVaultListEmpty = !vaults.isLoading && (vaults.data?.length ?? 0) === 0;
  const shouldAutoCreateFirstVault =
    !unauthorized && isVaultListEmpty && Boolean(session?.userId);

  useEffect(() => {
    autoCreateAttemptedRef.current = false;
  }, [session?.userId]);

  useEffect(() => {
    if (!shouldAutoCreateFirstVault || autoCreateAttemptedRef.current) {
      return;
    }

    autoCreateAttemptedRef.current = true;
    void createFirstVault.mutateAsync(firstVaultName);
  }, [createFirstVault, firstVaultName, shouldAutoCreateFirstVault]);

  const isPreparingFirstVault =
    shouldAutoCreateFirstVault &&
    (createFirstVault.isPending ||
      (autoCreateAttemptedRef.current && !createFirstVault.isError));
  const autoCreateErrorMessage =
    createFirstVault.error instanceof Error
      ? createFirstVault.error.message
      : 'We could not create your first vault automatically. Please try again.';

  return (
    <RequireAuth>
      <Page title="Vaults">
        {unauthorized ? (
          <UnauthorizedNotice />
        ) : (
          <>
            <Card title="Create Vault">
              <CreateVaultForm disabled={isPreparingFirstVault} />
            </Card>
            <Card title="Your Vaults">
              {vaults.isLoading ? (
                <p>Loading...</p>
              ) : isPreparingFirstVault ? (
                <div className="vaults-empty-state" role="status" aria-live="polite">
                  <div className="vault-illustration" aria-hidden="true">
                    <div className="vault-illustration__body">
                      <div className="vault-illustration__door">
                        <div className="vault-illustration__wheel">
                          <span className="vault-illustration__spoke vault-illustration__spoke--a" />
                          <span className="vault-illustration__spoke vault-illustration__spoke--b" />
                          <span className="vault-illustration__spoke vault-illustration__spoke--c" />
                          <span className="vault-illustration__spoke vault-illustration__spoke--d" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="vaults-empty-state__message">
                    Preparing your first vault, <strong>{firstVaultName}</strong>.
                  </p>
                </div>
              ) : (
                <VaultList vaults={vaults.data ?? []} />
              )}
              {createFirstVault.isError && isVaultListEmpty ? (
                <Alert message={autoCreateErrorMessage} />
              ) : null}
            </Card>
          </>
        )}
      </Page>
    </RequireAuth>
  );
};
