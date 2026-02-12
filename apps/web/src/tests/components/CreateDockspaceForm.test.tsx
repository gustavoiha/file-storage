import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateDockspaceForm } from '@/components/files/CreateDockspaceForm';

const mutateAsync = vi.fn(async () => {});
const mockState = vi.hoisted(() => ({
  isPending: false
}));

vi.mock('@/hooks/useDockspaces', () => ({
  useCreateDockspace: () => ({
    mutateAsync,
    isPending: mockState.isPending
  })
}));

beforeEach(() => {
  mutateAsync.mockClear();
  mockState.isPending = false;
});

afterEach(() => {
  cleanup();
});

describe('CreateDockspaceForm', () => {
  it('creates dockspace on submit', async () => {
    render(<CreateDockspaceForm />);

    fireEvent.change(screen.getByLabelText('Dockspace Name'), { target: { value: 'Docs' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create Dockspace' }));

    expect(mutateAsync).toHaveBeenCalledWith('Docs');
  });

  it('disables controls when externally disabled', () => {
    render(<CreateDockspaceForm disabled />);

    expect(screen.getByLabelText('Dockspace Name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create Dockspace' })).toBeDisabled();
  });
});
