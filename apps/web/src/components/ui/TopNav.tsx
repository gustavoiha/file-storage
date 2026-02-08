import { Link } from '@tanstack/react-router';
import { useAuth } from '@/hooks/useAuth';
import '@/styles/layout.css';

export const TopNav = () => {
  const { session, isAuthenticated, logout } = useAuth();

  if (!isAuthenticated || !session) {
    return null;
  }

  return (
    <header className="top-nav">
      <div className="top-nav__brand">ArticVault</div>
      <nav className="top-nav__links">
        <Link to="/vaults">Vaults</Link>
        <Link to="/settings/password">Change Password</Link>
        <button type="button" onClick={() => void logout()} className="top-nav__logout">
          Logout
        </button>
      </nav>
    </header>
  );
};
