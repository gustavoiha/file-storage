import { useEffect, useRef } from 'react';
import { useStore } from '@tanstack/react-store';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { CreateDockspaceForm } from '@/components/files/CreateDockspaceForm';
import { DockspaceList } from '@/components/files/DockspaceList';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { useCreateDockspace, useDockspaces } from '@/hooks/useDockspaces';
import { ApiError } from '@/lib/apiClient';
import { authStore } from '@/lib/authStore';

const FIRST_DOCKSPACE_NAME = 'My dockspace';

export const DockspacesPage = () => {
  const dockspaces = useDockspaces();
  const createFirstDockspace = useCreateDockspace();
  const { session } = useStore(authStore);
  const autoCreateAttemptedRef = useRef(false);
  const firstDockspaceName = FIRST_DOCKSPACE_NAME;
  const unauthorized =
    dockspaces.error instanceof ApiError && dockspaces.error.statusCode === 403;
  const isDockspaceListEmpty = !dockspaces.isLoading && (dockspaces.data?.length ?? 0) === 0;
  const shouldAutoCreateFirstDockspace =
    !unauthorized && isDockspaceListEmpty && Boolean(session?.userId);

  useEffect(() => {
    autoCreateAttemptedRef.current = false;
  }, [session?.userId]);

  useEffect(() => {
    if (!shouldAutoCreateFirstDockspace || autoCreateAttemptedRef.current) {
      return;
    }

    autoCreateAttemptedRef.current = true;
    void createFirstDockspace.mutateAsync(firstDockspaceName);
  }, [createFirstDockspace, firstDockspaceName, shouldAutoCreateFirstDockspace]);

  const isPreparingFirstDockspace =
    shouldAutoCreateFirstDockspace &&
    (createFirstDockspace.isPending ||
      (autoCreateAttemptedRef.current && !createFirstDockspace.isError));
  const autoCreateErrorMessage =
    createFirstDockspace.error instanceof Error
      ? createFirstDockspace.error.message
      : 'We could not create your first dockspace automatically. Please try again.';

  return (
    <RequireAuth>
      <Page title="Dockspaces">
        {unauthorized ? (
          <UnauthorizedNotice />
        ) : (
          <>
            <Card title="Create Dockspace">
              <CreateDockspaceForm disabled={isPreparingFirstDockspace} />
            </Card>
            <Card title="Your Dockspaces">
              {dockspaces.isLoading ? (
                <p>Loading...</p>
              ) : isPreparingFirstDockspace ? (
                <div className="dockspaces-empty-state" role="status" aria-live="polite">
                  <div className="dockspace-illustration" aria-hidden="true">
                    <div className="dockspace-illustration__body">
                      <div className="dockspace-illustration__door">
                        <div className="dockspace-illustration__wheel">
                          <span className="dockspace-illustration__spoke dockspace-illustration__spoke--a" />
                          <span className="dockspace-illustration__spoke dockspace-illustration__spoke--b" />
                          <span className="dockspace-illustration__spoke dockspace-illustration__spoke--c" />
                          <span className="dockspace-illustration__spoke dockspace-illustration__spoke--d" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="dockspaces-empty-state__message">
                    Preparing your first dockspace, <strong>{firstDockspaceName}</strong>.
                  </p>
                </div>
              ) : (
                <DockspaceList dockspaces={dockspaces.data ?? []} />
              )}
              {createFirstDockspace.isError && isDockspaceListEmpty ? (
                <Alert message={autoCreateErrorMessage} />
              ) : null}
            </Card>
          </>
        )}
      </Page>
    </RequireAuth>
  );
};
