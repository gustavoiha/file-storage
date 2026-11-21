import { useState, type FormEventHandler } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmFolderTrashDialog } from '@/components/files/ConfirmFolderTrashDialog';
import { ConfirmPurgeFileDialog } from '@/components/files/ConfirmPurgeFileDialog';

interface HarnessProps {
  isSubmitting?: boolean;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}

const preventSubmit: FormEventHandler<HTMLFormElement> = (event) => event.preventDefault();

const PurgeHarness = ({ isSubmitting = false, onSubmit = preventSubmit }: HarnessProps) => {
  const [target, setTarget] = useState<string | null>(null);
  return (
    <>
      <button type="button" onClick={() => setTarget('/docs/report.txt')}>
        Open
      </button>
      <button type="button">Behind</button>
      <ConfirmPurgeFileDialog
        errorMessage={null}
        fullPath={target}
        isOpen={Boolean(target)}
        isSubmitting={isSubmitting}
        onClose={() => setTarget(null)}
        onSubmit={onSubmit}
      />
    </>
  );
};

const FolderTrashHarness = ({ isSubmitting = false, onSubmit = preventSubmit }: HarnessProps) => {
  const [target, setTarget] = useState<string | null>(null);
  return (
    <>
      <button type="button" onClick={() => setTarget('/Travel')}>
        Open
      </button>
      <button type="button">Behind</button>
      <ConfirmFolderTrashDialog
        errorMessage={null}
        folderPath={target}
        isOpen={Boolean(target)}
        isSubmitting={isSubmitting}
        onClose={() => setTarget(null)}
        onSubmit={onSubmit}
      />
    </>
  );
};

const cases = [
  { name: 'ConfirmPurgeFileDialog', Harness: PurgeHarness, title: 'Purge file now', confirm: 'Purge now' },
  {
    name: 'ConfirmFolderTrashDialog',
    Harness: FolderTrashHarness,
    title: 'Move folder to trash',
    confirm: 'Move to trash'
  }
] as const;

describe.each(cases)('$name focus', ({ Harness, title, confirm }) => {
  afterEach(() => {
    cleanup();
  });

  // Keyboard activation: the opener holds focus when the dialog opens.
  const openWithKeyboard = () => {
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    return { opener, dialog: screen.getByRole('dialog', { name: title }) };
  };

  it('puts initial focus on Cancel when it opens', () => {
    render(<Harness />);
    const { dialog } = openWithKeyboard();

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('does not submit when Enter is pressed right after opening', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<FormEventHandler<HTMLFormElement>>(preventSubmit);
    render(<Harness onSubmit={onSubmit} />);
    const { opener } = openWithKeyboard();

    await user.keyboard('{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: title })).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const { dialog } = openWithKeyboard();
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const confirmButton = within(dialog).getByRole('button', { name: confirm });

    await user.tab();
    expect(confirmButton).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirmButton).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
  });

  it('keeps focus from leaving on Tab while both buttons are disabled', () => {
    render(<Harness isSubmitting />);
    const { dialog } = openWithKeyboard();
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    cancel.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => {
      cancel.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  it('returns focus to the opener after Escape', async () => {
    render(<Harness />);
    const { opener } = openWithKeyboard();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: title })).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('returns focus to the opener after Cancel', async () => {
    render(<Harness />);
    const { opener, dialog } = openWithKeyboard();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog', { name: title })).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('returns focus to the opener after a backdrop click', async () => {
    render(<Harness />);
    const { opener, dialog } = openWithKeyboard();

    fireEvent.mouseDown(dialog.parentElement as HTMLElement);

    expect(screen.queryByRole('dialog', { name: title })).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
