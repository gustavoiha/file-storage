import { Link } from '@tanstack/react-router';
import { Film, FolderOpen } from 'lucide-react';
import type { Dockspace } from '@/lib/apiTypes';

interface DockspaceListProps {
  dockspaces: Dockspace[];
}

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
          </Link>
        </article>
      ))}
    </div>
  );
};
