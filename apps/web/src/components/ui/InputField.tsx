import type { InputHTMLAttributes } from 'react';
import '@/styles/ui.css';

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
}

export const InputField = ({ id, label, error, ...rest }: InputFieldProps) => (
  <label className="ui-field" htmlFor={id}>
    <span className="ui-field__label">{label}</span>
    <input id={id} className="ui-input" {...rest} />
    {error ? <span className="ui-field__error">{error}</span> : null}
  </label>
);
