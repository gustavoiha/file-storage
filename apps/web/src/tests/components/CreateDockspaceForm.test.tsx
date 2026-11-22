import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateDockspaceForm } from '@/components/files/CreateDockspaceForm';

const mutateAsync = vi.fn(async () => {});
const mockState = vi.hoisted(() => ({
  isPending: false,
  error: null as Error | null
}));

vi.mock('@/hooks/useDockspaces', () => ({
  useCreateDockspace: () => ({
    mutateAsync,
    isPending: mockState.isPending,
    error: mockState.error,
    reset: () => {}
  })
}));

beforeEach(() => {
  mutateAsync.mockClear();
  mockState.isPending = false;
  mockState.error = null;
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

  it('keeps the dialog open with the error and focuses Cancel when creating fails', async () => {
    let rejectCreate: (error: Error) => void = () => {};
    mutateAsync.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectCreate = reject;
        })
    );
    const { rerender } = render(<CreateDockspaceForm />);

    fireEvent.click(screen.getByRole('button', { name: /Generic Files/i }));
    const input = screen.getByLabelText('Dockspace Name');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'Docs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Generic Dockspace' }));

    // While it submits, the controls are disabled and the browser drops focus to <body>.
    (document.activeElement as HTMLElement | null)?.blur();
    mockState.isPending = true;
    rerender(<CreateDockspaceForm />);
    expect(document.activeElement).toBe(document.body);

    await act(async () => {
      rejectCreate(new Error('Name already used'));
    });
    mockState.isPending = false;
    mockState.error = new Error('Name already used');
    rerender(<CreateDockspaceForm />);

    const dialog = screen.getByRole('dialog', { name: 'Create Generic Files Dockspace' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Name already used');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });
});
