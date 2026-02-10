import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/useAuth';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';

export const LoginForm = () => {
  const { login, confirmLogin } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challengeMessage, setChallengeMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCredentialsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const result = await login({ email, password });

      if (result.status === 'SIGNED_IN') {
        await navigate({ to: '/vaults' });
        return;
      }

      if (result.status === 'SIGN_UP_CONFIRMATION_REQUIRED') {
        await navigate({
          to: '/confirm-signup',
          search: {
            email: result.email,
            message: result.message
          }
        });
        return;
      }

      setChallengeMessage(result.message);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to sign in');
    }
  };

  const onCodeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const result = await confirmLogin(code);

      if (result.status === 'SIGNED_IN') {
        await navigate({ to: '/vaults' });
        return;
      }

      if (result.status === 'SIGN_UP_CONFIRMATION_REQUIRED') {
        await navigate({
          to: '/confirm-signup',
          search: {
            email: result.email || email,
            message: result.message
          }
        });
        return;
      }

      setChallengeMessage(result.message);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to confirm sign in');
    }
  };

  const confirmationRequired = Boolean(challengeMessage);

  return (
    <form onSubmit={confirmationRequired ? onCodeSubmit : onCredentialsSubmit}>
      {!confirmationRequired ? (
        <>
          <InputField
            id="login-email"
            label="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <InputField
            id="login-password"
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </>
      ) : (
        <>
          {challengeMessage ? <Alert message={challengeMessage} tone="info" /> : null}
          <InputField
            id="login-code"
            label="Verification code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
          />
        </>
      )}
      {error ? <Alert message={error} /> : null}
      <Button type="submit">{confirmationRequired ? 'Confirm Sign In' : 'Sign In'}</Button>
      <div className="auth-links">
        <Link to="/register">Create account</Link>
        <Link to="/forgot-password">Forgot password</Link>
      </div>
    </form>
  );
};
