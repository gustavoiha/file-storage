import { useSearch } from '@tanstack/react-router';
import { ConfirmSignUpForm } from '@/components/auth/ConfirmSignUpForm';
import { Card } from '@/components/ui/Card';
import { Page } from '@/components/ui/Page';

export const ConfirmSignUpPage = () => {
  const search = useSearch({ strict: false }) as { email?: string; message?: string };

  return (
    <Page title="Confirm Account">
      <Card>
        <ConfirmSignUpForm
          initialEmail={search.email ?? ''}
          initialMessage={search.message ?? ''}
        />
      </Card>
    </Page>
  );
};
