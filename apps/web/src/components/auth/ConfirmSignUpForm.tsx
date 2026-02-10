import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/useAuth';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';

interface ConfirmSignUpFormProps {
  initialEmail?: string;
  initialMessage?: string;
}

export const ConfirmSignUpForm = ({
  initialEmail = '',
  initialMessage
}: ConfirmSignUpFormProps) => {
  const { confirmSignUp, resendSignUpCode } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<string | null>(initialMessage ?? null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setError(null);

    try {
      await confirmSignUp({ email, code });
      await navigate({ to: '/login' });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to confirm account'
      );
    }
  };

  const onResend = async () => {
    setStatus(null);
    setError(null);

    try {
      await resendSignUpCode(email);
      setStatus('A new confirmation code has been sent.');
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to resend confirmation code'
      );
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <InputField
        id="confirm-signup-email"
        label="Email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <InputField
        id="confirm-signup-code"
        label="Confirmation code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        required
      />
      {error ? <Alert message={error} /> : null}
      {status ? <p className="auth-note">{status}</p> : null}
      <Button type="submit">Confirm Account</Button>
      <Button type="button" variant="secondary" onClick={onResend}>
        Resend Code
      </Button>
      <div className="auth-links">
        <Link to="/login">Back to login</Link>
      </div>
    </form>
  );
};
