import { Suspense, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { focusIsLost } from '@/components/files/useDialogDismiss';
import { Alert } from '@/components/ui/Alert';
import { Page } from '@/components/ui/Page';
import { SuspenseLoader } from '@/components/ui/SuspenseLoader';
import { useDockspaces } from '@/hooks/useDockspaces';
import { ApiError } from '@/lib/apiClient';
import { lazyRouteComponent } from '@tanstack/react-router';

const DockspaceFilesPage = lazyRouteComponent(
  () => import('@/pages/DockspaceFilesPage'),
  'DockspaceFilesPage'
);
const DockspaceMediaPage = lazyRouteComponent(
  () => import('@/pages/DockspaceMediaPage'),
  'DockspaceMediaPage'
);

export const DOCKSPACE_LIST_ERROR_MESSAGE = "Couldn't load this dockspace.";

/**
 * Focuses an element that is not focusable on its own (the workspace wrapper) and makes it unfocusable again once
 * focus leaves it, so a later click on the page background does not focus it.
 */
const focusTemporarily = (element: HTMLElement) => {
  element.setAttribute('tabindex', '-1');
  element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true });
  element.focus();
};

export const DockspaceWorkspacePage = () => {
  const { dockspaceId } = useParams({ from: '/dockspaces/$dockspaceId' });
  const dockspacesQuery = useDockspaces();
  const hasList = Boolean(dockspacesQuery.data);
  const dockspace = dockspacesQuery.data?.find((item) => item.dockspaceId === dockspaceId);
  const unauthorized =
    dockspacesQuery.error instanceof ApiError && dockspacesQuery.error.statusCode === 403;

  // The dockspace list failed and nothing is known about this dockspace (not even its type): the page shows only the
  // error with Try again, and mounts neither the files page nor the media page. Mounting one here would add a query
  // observer that refetches the failed list on mount; React Query v5 puts a query without data back to `pending`
  // (clearing `error`) while it refetches, so the page would swap back to its loader, unmount that page, fail again,
  // mount it again, and send GET /dockspaces in a tight loop. For the same reason the last failure is kept here until
  // the list loads, so every refetch (Try again, the switcher's Try again) keeps the error, and a focused Try again
  // button, mounted instead of showing the loader.
  const [listFailed, setListFailed] = useState(false);
  const currentlyFailed = !hasList && Boolean(dockspacesQuery.error);
  if (currentlyFailed && !listFailed) {
    setListFailed(true);
  } else if (hasList && listFailed) {
    setListFailed(false);
  }
  const showListError = !hasList && (currentlyFailed || listFailed);
  const isRetrying = showListError && dockspacesQuery.isFetching;

  const retryList = () => {
    if (dockspacesQuery.isFetching) {
      return;
    }
    void dockspacesQuery.refetch();
  };

  // When the list loads, the error (and Try again) goes away. If Try again had focus, focus fell to <body>: move it to
  // the workspace, which stays. A blur with no new target is the button being removed, so it keeps the flag.
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const retryHadFocusRef = useRef(false);
  const previousShowListErrorRef = useRef(showListError);
  useLayoutEffect(() => {
    const hadError = previousShowListErrorRef.current;
    previousShowListErrorRef.current = showListError;
    if (!hadError || showListError || !retryHadFocusRef.current) {
      return;
    }
    retryHadFocusRef.current = false;
    if (focusIsLost() && workspaceRef.current) {
      focusTemporarily(workspaceRef.current);
    }
  }, [showListError]);

  let content;
  if (showListError) {
    content = (
      <RequireAuth>
        <Page title="Dockspace">
          {unauthorized ? (
            <UnauthorizedNotice />
          ) : (
            <Alert
              message={DOCKSPACE_LIST_ERROR_MESSAGE}
              action={
                // aria-disabled, not disabled: a disabled button would drop its focus.
                <button
                  type="button"
                  className="dockspace-link-button"
                  aria-disabled={isRetrying ? 'true' : undefined}
                  aria-busy={isRetrying ? 'true' : undefined}
                  onClick={retryList}
                  onFocus={() => {
                    retryHadFocusRef.current = true;
                  }}
                  onBlur={(event) => {
                    if (event.relatedTarget) {
                      retryHadFocusRef.current = false;
                    }
                  }}
                >
                  {isRetrying ? 'Trying again…' : 'Try again'}
                </button>
              }
            />
          )}
        </Page>
      </RequireAuth>
    );
  } else if (!dockspace && dockspacesQuery.isLoading) {
    content = (
      <RequireAuth>
        <Page title="Dockspace">
          <SuspenseLoader label="Loading dockspace..." />
        </Page>
      </RequireAuth>
    );
  } else if (dockspace?.dockspaceType === 'PHOTOS_VIDEOS') {
    // Keyed by dockspace: switching dockspaces (same route, new id) starts the page fresh, so no
    // open folder, preview, info panel, selection or status message carries over.
    content = (
      <Suspense fallback={<SuspenseLoader label="Loading dockspace..." />}>
        <DockspaceMediaPage key={dockspaceId} dockspaceId={dockspaceId} dockspaceName={dockspace.name} />
      </Suspense>
    );
  } else {
    content = (
      <Suspense fallback={<SuspenseLoader label="Loading dockspace..." />}>
        <DockspaceFilesPage key={dockspaceId} />
      </Suspense>
    );
  }

  return (
    <div ref={workspaceRef} className="dockspace-workspace">
      {content}
    </div>
  );
};
