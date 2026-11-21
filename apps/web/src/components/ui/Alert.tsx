import type { ReactNode } from 'react';
import '@/styles/ui.css';

interface AlertProps {
  message: string;
  tone?: 'error' | 'info';
  /** Inline control after the message, e.g. a "Try again" button. */
  action?: ReactNode;
}

export const Alert = ({ message, tone = 'error', action }: AlertProps) => (
  <p role="alert" className={`ui-alert ui-alert--${tone}`}>
    {message}
    {action ? <> {action}</> : null}
  </p>
);
