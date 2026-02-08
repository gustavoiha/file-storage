import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';

export const ForgotPasswordPage = () => (
  <Page title="Forgot Password">
    <Card>
      <ForgotPasswordForm />
    </Card>
  </Page>
);
