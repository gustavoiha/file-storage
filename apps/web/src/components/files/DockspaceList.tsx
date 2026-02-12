import { Link } from '@tanstack/react-router';
import type { Dockspace } from '@/lib/apiTypes';

interface DockspaceListProps {
  dockspaces: Dockspace[];
}

export const DockspaceList = ({ dockspaces }: DockspaceListProps) => {
  if (!dockspaces.length) {
    return <p>No dockspaces yet.</p>;
  }

  return (
    <ul className="resource-list">
      {dockspaces.map((dockspace) => (
        <li key={dockspace.dockspaceId} className="resource-list__item">
          <Link to="/dockspaces/$dockspaceId" params={{ dockspaceId: dockspace.dockspaceId }}>
            {dockspace.name}
          </Link>
        </li>
      ))}
    </ul>
  );
};
