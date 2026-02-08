import '@/styles/ui.css';

interface AlertProps {
  message: string;
  tone?: 'error' | 'info';
}

export const Alert = ({ message, tone = 'error' }: AlertProps) => (
  <p role="alert" className={`ui-alert ui-alert--${tone}`}>
    {message}
  </p>
);
