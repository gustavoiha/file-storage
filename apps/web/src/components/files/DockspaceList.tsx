import { Link } from '@tanstack/react-router';
import { Film, FolderOpen } from 'lucide-react';
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
    return null;
  }

  return (
    <div className="dockspace-grid__list" role="list" aria-label="Your dockspaces">
      {dockspaces.map((dockspace) => (
        <article key={dockspace.dockspaceId} className="dockspace-grid__item" role="listitem">
          <Link
            to="/dockspaces/$dockspaceId"
            params={{ dockspaceId: dockspace.dockspaceId }}
            className={`dockspace-card dockspace-card--workspace ${
              dockspace.dockspaceType === 'PHOTOS_VIDEOS' ? 'dockspace-card--media' : 'dockspace-card--generic'
            }`}
          >
            <span className="dockspace-card__icon" aria-hidden="true">
              {dockspace.dockspaceType === 'PHOTOS_VIDEOS' ? <Film size={24} /> : <FolderOpen size={24} />}
            </span>
            <span className="dockspace-card__title">{dockspace.name}</span>
            <span className="dockspace-card__type">{formatDockspaceType(dockspace.dockspaceType)}</span>
            <dl className="dockspace-card__metrics">
              <div className="dockspace-card__metric">
                <dt>Files</dt>
                <dd>{formatFileCount(dockspace.totalFileCount)}</dd>
              </div>
              <div className="dockspace-card__metric">
                <dt>Total size</dt>
                <dd>{formatSize(dockspace.totalSizeBytes)}</dd>
              </div>
              <div className="dockspace-card__metric">
                <dt>Last upload</dt>
                <dd>{formatLastUpload(dockspace.lastUploadAt)}</dd>
              </div>
            </dl>
          </Link>
        </article>
      ))}
    </div>
  );
};
