import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert } from '@/components/ui/Alert';

describe('Alert', () => {
  it('renders error message', () => {
    render(<Alert message="Err" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Err');
  });
});
