import { useLayoutEffect, useRef, useState } from 'react';
import { focusIsLost } from '@/components/files/useDialogDismiss';
import { useDockspaces } from '@/hooks/useDockspaces';
import { ApiError } from '@/lib/apiClient';

interface UseDockspaceListLoadOptions {
  /**
   * Where focus goes when the list loads after Try again had focus (the error, and its button, are removed and focus
   * fell to <body>). Called after the page rendered its content.
   */
  getFocusTarget: () => HTMLElement | null | undefined;
}

/**
 * The dockspace list for a page that cannot show anything useful without it (the dockspaces grid, the usage page).
 *
 * A failed load stays shown (with its Try again) until the list loads: React Query v5 puts a query without data back
 * to `pending` (clearing `error`) while it refetches, and that happens on ANY refetch (this page's Try again, the
 * switcher's, a create's invalidation), so the last failure is kept here and the error, with a focused Try again
 * button, stays mounted instead of being swapped for the loader.
 */
export const useDockspaceListLoad = ({ getFocusTarget }: UseDockspaceListLoadOptions) => {
  const query = useDockspaces();
  const dockspaces = query.data;
  const hasList = Boolean(dockspaces);

  const [lastListError, setLastListError] = useState<unknown>(null);
  const currentListError = hasList ? null : (query.error ?? null);
  if (currentListError !== null && currentListError !== lastListError) {
    setLastListError(currentListError);
  } else if (hasList && lastListError !== null) {
    setLastListError(null);
  }

  const listError = hasList ? null : (currentListError ?? lastListError);
  // A 403 shows the Not Authorized notice even over a list loaded before (as it always has).
  const accessError = query.error ?? listError;
  const unauthorized = accessError instanceof ApiError && accessError.statusCode === 403;
  const showLoadError = listError !== null && !unauthorized;
  const isRetrying = showLoadError && query.isFetching;
  const isLoading = !hasList && listError === null && query.isLoading;

  const retry = () => {
    // One request per press: a press while a request runs (this one or another observer's) does nothing.
    if (query.isFetching) {
      return;
    }
    void query.refetch();
  };

  // When the list loads, the error (and Try again) goes away. If Try again had focus, focus fell to <body>: move it to
  // the page's target. A blur with no new target is the button being removed, so it keeps the flag.
  const retryHadFocusRef = useRef(false);
  const previousShowLoadErrorRef = useRef(showLoadError);
  const getFocusTargetRef = useRef(getFocusTarget);
  getFocusTargetRef.current = getFocusTarget;
  useLayoutEffect(() => {
    const hadError = previousShowLoadErrorRef.current;
    previousShowLoadErrorRef.current = showLoadError;
    if (!hadError || showLoadError || !retryHadFocusRef.current) {
      return;
    }
    retryHadFocusRef.current = false;
    if (focusIsLost()) {
      getFocusTargetRef.current()?.focus();
    }
  }, [showLoadError]);

  return {
    dockspaces,
    isLoading,
    unauthorized,
    showLoadError,
    isRetrying,
    retry,
    retryFocusHandlers: {
      onFocus: () => {
        retryHadFocusRef.current = true;
      },
      onBlur: (event: { relatedTarget: EventTarget | null }) => {
        if (event.relatedTarget) {
          retryHadFocusRef.current = false;
        }
      }
    }
  };
};
