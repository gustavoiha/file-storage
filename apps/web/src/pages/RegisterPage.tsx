import { RegisterForm } from '@/components/auth/RegisterForm';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';

export const RegisterPage = () => (
  <Page title="Create Account">
    <Card>
      <RegisterForm />
    </Card>
  </Page>
);
