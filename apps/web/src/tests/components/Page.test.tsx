import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Page } from '@/components/ui/Page';

describe('Page', () => {
  it('renders title and children', () => {
    render(<Page title="X">Inner</Page>);
    expect(screen.getByRole('heading', { name: 'X' })).toBeInTheDocument();
    expect(screen.getByText('Inner')).toBeInTheDocument();
  });
});
