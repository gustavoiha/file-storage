import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';
import { LoginForm } from '@/components/auth/LoginForm';

export const LoginPage = () => (
  <Page title="Sign In">
    <Card>
      <LoginForm />
    </Card>
  </Page>
);
