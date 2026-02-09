import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UnauthorizedNotice } from '@/components/auth/UnauthorizedNotice';

describe('UnauthorizedNotice', () => {
  it('renders unauthorized guidance', () => {
    render(<UnauthorizedNotice />);

    expect(screen.getByText('Not Authorized')).toBeInTheDocument();
    expect(
      screen.getByText('This account is authenticated but not entitled to use ArticVault.')
    ).toBeInTheDocument();
  });
});
