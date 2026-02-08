import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/useAuth';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';

interface ResetPasswordFormProps {
  initialEmail?: string;
}

export const ResetPasswordForm = ({ initialEmail = '' }: ResetPasswordFormProps) => {
  const { confirmForgotPassword } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      await confirmForgotPassword({ email, code, newPassword });
      await navigate({ to: '/login' });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Password reset failed'
      );
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <InputField
        id="reset-email"
        label="Email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <InputField
        id="reset-code"
        label="Verification code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        required
      />
      <InputField
        id="reset-password"
        label="New password"
        type="password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        required
      />
      {error ? <Alert message={error} /> : null}
      <Button type="submit">Set New Password</Button>
      <div className="auth-links">
        <Link to="/login">Back to login</Link>
      </div>
    </form>
  );
};
