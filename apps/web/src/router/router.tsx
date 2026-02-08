import {
  Outlet,
  createRoute,
  createRootRoute,
  createRouter,
  redirect
} from '@tanstack/react-router';
import { TopNav } from '@/components/ui/TopNav';
import { authStore } from '@/lib/authStore';
import { ChangePasswordPage } from '@/pages/ChangePasswordPage';
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage';
import { LoginPage } from '@/pages/LoginPage';
import { PurgedPage } from '@/pages/PurgedPage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { TrashPage } from '@/pages/TrashPage';
import { VaultFilesPage } from '@/pages/VaultFilesPage';
import { VaultsPage } from '@/pages/VaultsPage';

const rootRoute = createRootRoute({
  component: () => (
    <>
      <TopNav />
      <Outlet />
    </>
  )
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    const session = authStore.state.session;
    throw redirect({
      to: session ? '/vaults' : '/login'
    });
  }
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: RegisterPage
});

const forgotPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === 'string' ? search.email : ''
  }),
  component: ResetPasswordPage
});

const vaultsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vaults',
  component: VaultsPage
});

const vaultFilesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vaults/$vaultId',
  component: VaultFilesPage
});

const trashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vaults/$vaultId/trash',
  component: TrashPage
});

const purgedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/vaults/$vaultId/purged',
  component: PurgedPage
});

const changePasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/password',
  component: ChangePasswordPage
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  vaultsRoute,
  vaultFilesRoute,
  trashRoute,
  purgedRoute,
  changePasswordRoute
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent'
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
