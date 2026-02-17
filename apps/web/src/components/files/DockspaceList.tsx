import { Link } from '@tanstack/react-router';
import type { Dockspace } from '@/lib/apiTypes';

interface DockspaceListProps {
  dockspaces: Dockspace[];
}

const numberFormatter = new Intl.NumberFormat();
const metricsDateFormatter = new Intl.DateTimeFormat('en-US', {
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

const formatLastUpload = (lastUploadAt?: string): string => {
  if (!lastUploadAt) {
    return 'Never';
  }

  const date = new Date(lastUploadAt);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return metricsDateFormatter.format(date);
};

const formatDockspaceType = (dockspaceType: Dockspace['dockspaceType']): string =>
  dockspaceType === 'PHOTOS_VIDEOS' ? 'Photos & Videos' : 'Generic Files';

export const DockspaceList = ({ dockspaces }: DockspaceListProps) => {
  if (!dockspaces.length) {
    return <p>No dockspaces yet.</p>;
  }

  return (
    <ul className="resource-list">
      {dockspaces.map((dockspace) => (
        <li key={dockspace.dockspaceId} className="resource-list__item resource-list__item--dockspace">
          <div className="dockspace-list-item__header">
            <Link to="/dockspaces/$dockspaceId" params={{ dockspaceId: dockspace.dockspaceId }}>
              {dockspace.name}
            </Link>
            <span className="dockspace-list-item__type">{formatDockspaceType(dockspace.dockspaceType)}</span>
          </div>
          <dl className="dockspace-list-item__metrics">
            <div className="dockspace-list-item__metric">
              <dt>Files</dt>
              <dd>{formatFileCount(dockspace.totalFileCount)}</dd>
            </div>
            <div className="dockspace-list-item__metric">
              <dt>Total size</dt>
              <dd>{formatSize(dockspace.totalSizeBytes)}</dd>
            </div>
            <div className="dockspace-list-item__metric">
              <dt>Last upload</dt>
              <dd>{formatLastUpload(dockspace.lastUploadAt)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
};
