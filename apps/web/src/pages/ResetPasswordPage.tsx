import { useSearch } from '@tanstack/react-router';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';

export const ResetPasswordPage = () => {
  const search = useSearch({ strict: false }) as { email?: string };

  return (
    <Page title="Reset Password">
      <Card>
        <ResetPasswordForm initialEmail={search.email ?? ''} />
      </Card>
    </Page>
  );
};
