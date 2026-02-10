import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/useAuth';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';

export const RegisterForm = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const result = await register({ email, password });
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

      await navigate({ to: '/login' });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to register');
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <InputField
        id="register-email"
        label="Email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <InputField
        id="register-password"
        label="Password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error ? <Alert message={error} /> : null}
      <Button type="submit">Create Account</Button>
      <div className="auth-links">
        <Link to="/login">Back to login</Link>
      </div>
    </form>
  );
};
