import {
  Outlet,
  createRoute,
  createRootRoute,
  createRouter,
  lazyRouteComponent,
  redirect
} from '@tanstack/react-router';
import { TopNav } from '@/components/ui/TopNav';
import { authStore } from '@/lib/authStore';

const LoginPage = lazyRouteComponent(() => import('@/pages/LoginPage'), 'LoginPage');
const RegisterPage = lazyRouteComponent(() => import('@/pages/RegisterPage'), 'RegisterPage');
const ConfirmSignUpPage = lazyRouteComponent(
  () => import('@/pages/ConfirmSignUpPage'),
  'ConfirmSignUpPage'
);
const ForgotPasswordPage = lazyRouteComponent(
  () => import('@/pages/ForgotPasswordPage'),
  'ForgotPasswordPage'
);
const ResetPasswordPage = lazyRouteComponent(
  () => import('@/pages/ResetPasswordPage'),
  'ResetPasswordPage'
);
const DockspacesPage = lazyRouteComponent(() => import('@/pages/DockspacesPage'), 'DockspacesPage');
const DockspaceWorkspacePage = lazyRouteComponent(
  () => import('@/pages/DockspaceWorkspacePage'),
  'DockspaceWorkspacePage'
);
const TrashPage = lazyRouteComponent(() => import('@/pages/TrashPage'), 'TrashPage');
const PurgedPage = lazyRouteComponent(() => import('@/pages/PurgedPage'), 'PurgedPage');
const ChangePasswordPage = lazyRouteComponent(
  () => import('@/pages/ChangePasswordPage'),
  'ChangePasswordPage'
);

const rootRoute = createRootRoute({
  component: () => (
    <div className="app-shell">
      <TopNav />
      <div className="app-shell__body">
        <Outlet />
      </div>
    </div>
  )
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    const session = authStore.state.session;
    throw redirect({
      to: session ? '/dockspaces' : '/login'
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

const confirmSignUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/confirm-signup',
  validateSearch: (search: Record<string, unknown>) => ({
    email: typeof search.email === 'string' ? search.email : '',
    message: typeof search.message === 'string' ? search.message : ''
  }),
  component: ConfirmSignUpPage
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

const dockspacesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dockspaces',
  component: DockspacesPage
});

const dockspaceFilesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dockspaces/$dockspaceId',
  component: DockspaceWorkspacePage
});

const trashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dockspaces/$dockspaceId/trash',
  component: TrashPage
});

const purgedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dockspaces/$dockspaceId/purged',
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
  confirmSignUpRoute,
  forgotPasswordRoute,
  resetPasswordRoute,
  dockspacesRoute,
  dockspaceFilesRoute,
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
