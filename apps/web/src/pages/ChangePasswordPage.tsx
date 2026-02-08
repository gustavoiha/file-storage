import { RequireAuth } from '@/components/auth/RequireAuth';
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';

export const ChangePasswordPage = () => (
  <RequireAuth>
    <Page title="Change Password">
      <Card>
        <ChangePasswordForm />
      </Card>
    </Page>
  </RequireAuth>
);
