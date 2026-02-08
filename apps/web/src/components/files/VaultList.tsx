import { Link } from '@tanstack/react-router';
import type { Vault } from '@/lib/apiTypes';

interface VaultListProps {
  vaults: Vault[];
}

export const VaultList = ({ vaults }: VaultListProps) => {
  if (!vaults.length) {
    return <p>No vaults yet.</p>;
  }

  return (
    <ul className="resource-list">
      {vaults.map((vault) => (
        <li key={vault.vaultId} className="resource-list__item">
          <Link to="/vaults/$vaultId" params={{ vaultId: vault.vaultId }}>
            {vault.name}
          </Link>
        </li>
      ))}
    </ul>
  );
};
