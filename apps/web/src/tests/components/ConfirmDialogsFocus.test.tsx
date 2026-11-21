import { useState, type FormEventHandler } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmFolderTrashDialog } from '@/components/files/ConfirmFolderTrashDialog';
import { ConfirmPurgeFileDialog } from '@/components/files/ConfirmPurgeFileDialog';

interface HarnessProps {
  errorMessage?: string | null;
  isSubmitting?: boolean;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}

const preventSubmit: FormEventHandler<HTMLFormElement> = (event) => event.preventDefault();

const PurgeHarness = ({
  errorMessage = null,
  isSubmitting = false,
  onSubmit = preventSubmit
}: HarnessProps) => {
  const [target, setTarget] = useState<string | null>(null);
  return (
    <>
      <button type="button" onClick={() => setTarget('/docs/report.txt')}>
        Open
      </button>
      <button type="button">Behind</button>
      <ConfirmPurgeFileDialog
        errorMessage={errorMessage}
        fullPath={target}
        isOpen={Boolean(target)}
        isSubmitting={isSubmitting}
        onClose={() => setTarget(null)}
        onSubmit={onSubmit}
      />
    </>
  );
};

const FolderTrashHarness = ({
  errorMessage = null,
  isSubmitting = false,
  onSubmit = preventSubmit
}: HarnessProps) => {
  const [target, setTarget] = useState<string | null>(null);
  return (
    <>
      <button type="button" onClick={() => setTarget('/Travel')}>
        Open
      </button>
      <button type="button">Behind</button>
      <ConfirmFolderTrashDialog
        errorMessage={errorMessage}
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

  // A browser moves focus from a button to body when the button is disabled. jsdom keeps it on
  // the disabled button (and will not blur it), so move it to body through a removed element.
  // Tab keydown then targets body, not the dialog.
  const moveFocusToBody = () => {
    const placeholder = document.createElement('input');
    document.body.append(placeholder);
    placeholder.focus();
    placeholder.remove();
    expect(document.body).toHaveFocus();
  };

  it('keeps Tab and Shift+Tab from leaving while submitting', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    openWithKeyboard();

    rerender(<Harness isSubmitting />);
    moveFocusToBody();

    await user.tab();
    expect(document.body).toHaveFocus();
    await user.tab({ shift: true });
    expect(document.body).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab inside the dialog after a failed submit', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    const { dialog } = openWithKeyboard();
    const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
    const confirmButton = within(dialog).getByRole('button', { name: confirm });

    rerender(<Harness isSubmitting />);
    moveFocusToBody();
    rerender(<Harness errorMessage="Something went wrong." />);
    expect(cancel).toHaveFocus();
    // Focus can still end up on body (e.g. the user clicked a non-focusable part of the dialog).
    moveFocusToBody();

    await user.tab();
    expect(confirmButton).toHaveFocus();

    moveFocusToBody();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
  });

  it('uses a level 2 heading for its title', () => {
    render(<Harness />);
    const { dialog } = openWithKeyboard();

    expect(within(dialog).getByRole('heading', { name: title })).toHaveProperty('tagName', 'H2');
  });

  it('moves focus to Cancel after a failed submit, keeping the error announced', () => {
    const { rerender } = render(<Harness />);
    const { dialog } = openWithKeyboard();
    within(dialog).getByRole('button', { name: confirm }).focus();

    rerender(<Harness isSubmitting />);
    moveFocusToBody();
    rerender(<Harness errorMessage="Something went wrong." />);

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Something went wrong.');
  });

  it('moves focus to Cancel when the error arrives after the submit ends', () => {
    const { rerender } = render(<Harness />);
    const { dialog } = openWithKeyboard();

    rerender(<Harness isSubmitting />);
    moveFocusToBody();
    rerender(<Harness />);
    expect(document.body).toHaveFocus();
    rerender(<Harness errorMessage="Something went wrong." />);

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('moves focus to Cancel when the error arrives before the submit ends', () => {
    const { rerender } = render(<Harness />);
    const { dialog } = openWithKeyboard();

    rerender(<Harness isSubmitting />);
    moveFocusToBody();
    rerender(<Harness isSubmitting errorMessage="Something went wrong." />);
    expect(document.body).toHaveFocus();
    rerender(<Harness errorMessage="Something went wrong." />);

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('leaves focus where it is after a failed submit when it was not lost', () => {
    const { rerender } = render(<Harness />);
    const { dialog } = openWithKeyboard();
    const confirmButton = within(dialog).getByRole('button', { name: confirm });

    rerender(<Harness isSubmitting />);
    rerender(<Harness errorMessage="Something went wrong." />);
    confirmButton.focus();
    rerender(<Harness errorMessage="Something else went wrong." />);

    expect(confirmButton).toHaveFocus();
  });

  it('does not move focus when an error is shown without a submit', () => {
    const { rerender } = render(<Harness />);
    openWithKeyboard();

    moveFocusToBody();
    rerender(<Harness errorMessage="Something went wrong." />);

    expect(document.body).toHaveFocus();
  });

  it('returns focus to the opener when closed after a failed submit', async () => {
    const { rerender } = render(<Harness />);
    const { opener, dialog } = openWithKeyboard();

    rerender(<Harness isSubmitting />);
    moveFocusToBody();
    rerender(<Harness errorMessage="Something went wrong." />);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: title })).not.toBeInTheDocument();
    expect(dialog).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('pulls focus back into the dialog when Tab is pressed on the page behind', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const { opener, dialog } = openWithKeyboard();

    // The next control after the opener in page order is outside the dialog.
    opener.focus();
    await user.tab();

    expect(within(dialog).getByRole('button', { name: confirm })).toHaveFocus();
  });

  it('stops trapping Tab once the dialog closes', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const { opener, dialog } = openWithKeyboard();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(opener).toHaveFocus());
    await user.tab();

    expect(screen.getByRole('button', { name: 'Behind' })).toHaveFocus();
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
