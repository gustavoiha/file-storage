import { useRouterState } from '@tanstack/react-router';

/** Routes that are "inside a dockspace": the dockspace switcher shows on these only. */
const IN_DOCKSPACE_ROUTE_IDS: ReadonlySet<string> = new Set([
  '/dockspaces/$dockspaceId',
  '/dockspaces/$dockspaceId/trash',
  '/dockspaces/$dockspaceId/usage'
]);

/** The dockspace id of the current route when it is inside a dockspace, else null. */
export const useCurrentDockspaceId = (): string | null =>
  useRouterState({
    select: (state) => {
      const match = state.matches.find((item) => IN_DOCKSPACE_ROUTE_IDS.has(item.routeId));
      const dockspaceId = (match?.params as { dockspaceId?: unknown } | undefined)?.dockspaceId;
      return typeof dockspaceId === 'string' && dockspaceId ? dockspaceId : null;
    }
  });
