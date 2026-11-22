import { useRef } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';
import { DockspaceListLoadError } from '@/components/files/DockspaceListLoadError';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { useDockspaceListLoad } from '@/hooks/useDockspaceListLoad';

export const DOCKSPACE_USAGE_LOAD_ERROR_MESSAGE = "Couldn't load this dockspace's usage.";

const numberFormatter = new Intl.NumberFormat();
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC'
});

const formatFileCount = (count: number): string => `${numberFormatter.format(count)} files`;

const formatSize = (sizeBytes: number): string => {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = sizeBytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = value >= 10 ? 1 : 2;
  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
};

const formatDateTime = (value?: string): string => {
  if (!value) {
    return 'Never';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return dateFormatter.format(date);
};

const formatDockspaceType = (dockspaceType: 'GENERIC_FILES' | 'PHOTOS_VIDEOS'): string =>
  dockspaceType === 'PHOTOS_VIDEOS' ? 'Photos & Videos' : 'Generic Files';

export const DockspaceUsagePage = () => {
  const { dockspaceId } = useParams({ from: '/dockspaces/$dockspaceId/usage' });
  const backLinkRef = useRef<HTMLAnchorElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const dockspaceList = useDockspaceListLoad({
    // After Try again loads the list: Back to dockspace (the usage card's stable control). "Dockspace not found." and
    // Not Authorized (a retry that returns 403) have no control: the page title.
    getFocusTarget: () => backLinkRef.current ?? titleRef.current
  });
  const dockspace = dockspaceList.dockspaces?.find((item) => item.dockspaceId === dockspaceId);

  return (
    <RequireAuth>
      <Page title={dockspace ? `${dockspace.name} usage` : 'Detailed usage'} titleRef={titleRef}>
        {dockspaceList.unauthorized ? (
          <UnauthorizedNotice />
        ) : dockspaceList.showLoadError ? (
          // Without the list nothing is known about this dockspace: an error with Try again, not "not found".
          <DockspaceListLoadError
            message={DOCKSPACE_USAGE_LOAD_ERROR_MESSAGE}
            isRetrying={dockspaceList.isRetrying}
            onRetry={dockspaceList.retry}
            focusHandlers={dockspaceList.retryFocusHandlers}
          />
        ) : dockspaceList.isLoading ? (
          <p>Loading usage...</p>
        ) : !dockspace ? (
          <p>Dockspace not found.</p>
        ) : (
          <Card title="Detailed usage">
            <dl className="dockspace-usage__metrics">
              <div className="dockspace-usage__metric">
                <dt>Type</dt>
                <dd>{formatDockspaceType(dockspace.dockspaceType)}</dd>
              </div>
              <div className="dockspace-usage__metric">
                <dt>Total files</dt>
                <dd>{formatFileCount(dockspace.totalFileCount)}</dd>
              </div>
              <div className="dockspace-usage__metric">
                <dt>Total size</dt>
                <dd>{formatSize(dockspace.totalSizeBytes)}</dd>
              </div>
              <div className="dockspace-usage__metric">
                <dt>Last upload</dt>
                <dd>{formatDateTime(dockspace.lastUploadAt)}</dd>
              </div>
              <div className="dockspace-usage__metric">
                <dt>Created</dt>
                <dd>{formatDateTime(dockspace.createdAt)}</dd>
              </div>
            </dl>
            <Link ref={backLinkRef} to="/dockspaces/$dockspaceId" params={{ dockspaceId }}>
              Back to dockspace
            </Link>
          </Card>
        )}
      </Page>
    </RequireAuth>
  );
};

