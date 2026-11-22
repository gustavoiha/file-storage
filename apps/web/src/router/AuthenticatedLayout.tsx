import { Outlet } from '@tanstack/react-router';

/** The query client is provided by the app shell (see AppShell), so the top nav shares its cache. */
export const AuthenticatedLayout = () => <Outlet />;
