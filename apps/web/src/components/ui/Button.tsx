import { forwardRef, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import '@/styles/ui.css';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
}

export const Button = forwardRef<HTMLButtonElement, PropsWithChildren<ButtonProps>>(
  ({ variant = 'primary', size = 'md', type = 'button', className, children, ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={[`ui-button ui-button--${variant}`, size === 'sm' ? 'ui-button--sm' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
);

Button.displayName = 'Button';
