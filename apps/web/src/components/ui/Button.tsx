import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
import '@/styles/ui.css';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  children,
  ...rest
}: PropsWithChildren<ButtonProps>) => (
  <button
    type={type}
    className={[`ui-button ui-button--${variant}`, size === 'sm' ? 'ui-button--sm' : '', className ?? '']
      .filter(Boolean)
      .join(' ')}
    {...rest}
  >
    {children}
  </button>
);
