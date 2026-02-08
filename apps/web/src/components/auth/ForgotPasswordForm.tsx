import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/useAuth';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';

export const ForgotPasswordForm = () => {
  const { forgotPassword } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      await forgotPassword(email);
      await navigate({
        to: '/reset-password',
        search: {
          email
        }
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Password reset request failed'
      );
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <InputField
        id="forgot-email"
        label="Email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      {error ? <Alert message={error} /> : null}
      <Button type="submit">Send Reset Code</Button>
      <div className="auth-links">
        <Link to="/login">Back to login</Link>
      </div>
    </form>
  );
};
