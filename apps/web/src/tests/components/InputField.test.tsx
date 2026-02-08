import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InputField } from '@/components/ui/InputField';

describe('InputField', () => {
  it('renders label and updates value', () => {
    const onChange = vi.fn();

    render(
      <InputField id="email" label="Email" value="" onChange={onChange} aria-label="Email" />
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
