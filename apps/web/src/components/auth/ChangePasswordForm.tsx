import { useState, type FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';

export const ChangePasswordForm = () => {
  const { changePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);

    try {
      await changePassword(currentPassword, newPassword);
      setStatus('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to update password'
      );
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <InputField
        id="change-current-password"
        label="Current password"
        type="password"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        required
      />
      <InputField
        id="change-new-password"
        label="New password"
        type="password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        required
      />
      {error ? <Alert message={error} /> : null}
      {status ? <Alert message={status} tone="info" /> : null}
      <Button type="submit">Change Password</Button>
    </form>
  );
};
