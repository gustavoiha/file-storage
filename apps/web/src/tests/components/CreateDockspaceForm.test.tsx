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
  it('opens dialog and creates generic dockspace', async () => {
    render(<CreateDockspaceForm />);

    fireEvent.click(screen.getByRole('button', { name: /Generic Files/i }));
    fireEvent.change(screen.getByLabelText('Dockspace Name'), { target: { value: 'Docs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Generic Dockspace' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      name: 'Docs',
      dockspaceType: 'GENERIC_FILES'
    });
  });

  it('opens dialog and creates media dockspace', async () => {
    render(<CreateDockspaceForm />);

    fireEvent.click(screen.getByRole('button', { name: /Photos & Videos/i }));
    fireEvent.change(screen.getByLabelText('Dockspace Name'), { target: { value: 'Camera Roll' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Media Dockspace' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      name: 'Camera Roll',
      dockspaceType: 'PHOTOS_VIDEOS'
    });
  });

  it('disables controls when externally disabled', () => {
    render(<CreateDockspaceForm disabled />);

    expect(screen.getByRole('button', { name: /Generic Files/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Photos & Videos/i })).toBeDisabled();
  });
});
