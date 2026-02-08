import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
import '@/styles/ui.css';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = ({
  variant = 'primary',
  type = 'button',
  children,
  ...rest
}: PropsWithChildren<ButtonProps>) => (
  <button type={type} className={`ui-button ui-button--${variant}`} {...rest}>
    {children}
  </button>
);
