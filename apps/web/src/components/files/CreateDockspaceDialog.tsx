import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import {
  useDialogDismiss,
  useDialogTabTrap,
  useFocusAfterFailedSubmit
} from '@/components/files/useDialogDismiss';
import { useCreateDockspace } from '@/hooks/useDockspaces';
import type { Dockspace, DockspaceType } from '@/lib/apiTypes';

interface CreateDockspaceDialogProps {
  /** The type of dockspace to create; null keeps the dialog closed. */
  dockspaceType: DockspaceType | null;
  onClose: () => void;
  /** Runs after the dockspace was created and the list refreshed, before the dialog closes. */
  onCreated?: ((dockspace: Dockspace) => Promise<void> | void) | undefined;
  /** See useDialogDismiss: where focus goes when the dialog closes (default: the opener). */
  getReturnFocusTarget?: (() => HTMLElement | null | undefined) | undefined;
  /** Extra class for the backdrop, e.g. to stack it above the phone dockspace switcher. */
  backdropClassName?: string | undefined;
}

const dialogCopy = (dockspaceType: DockspaceType | null) =>
  dockspaceType === 'PHOTOS_VIDEOS'
    ? {
        title: 'Create Photos & Videos Dockspace',
        description: 'Folderless media workspace with album organization and media-only upload rules.',
        confirmLabel: 'Create Media Dockspace',
        placeholder: 'Camera Roll'
      }
    : {
        title: 'Create Generic Files Dockspace',
        description:
          'Structured folders and files for documents, source code, archives, and everything else.',
        confirmLabel: 'Create Generic Dockspace',
        placeholder: 'Personal Docs'
      };

/**
 * The create-dockspace dialog, shared by the /dockspaces page and the dockspace switcher.
 * It stays mounted while closed so focus can return to its opener when it closes.
 */
export const CreateDockspaceDialog = ({
  dockspaceType,
  onClose,
  onCreated,
  getReturnFocusTarget,
  backdropClassName
}: CreateDockspaceDialogProps) => {
  const createDockspace = useCreateDockspace();
  const [name, setName] = useState('');
  const isOpen = dockspaceType !== null;
  const isPending = createDockspace.isPending;
  const errorMessage = createDockspace.error instanceof Error ? createDockspace.error.message : null;
  const { onBackdropMouseDown } = useDialogDismiss({
    isOpen,
    onClose: () => {
      if (!isPending) {
        onClose();
      }
    },
    getReturnFocusTarget
  });
  const dialogRef = useDialogTabTrap<HTMLDialogElement>(isOpen);
  const cancelRef = useFocusAfterFailedSubmit<HTMLButtonElement>({
    isOpen,
    isSubmitting: isPending,
    errorMessage
  });
  const resetMutationRef = useRef(createDockspace.reset);
  resetMutationRef.current = createDockspace.reset;

  // Every opening starts empty, without the previous attempt's error.
  useEffect(() => {
    if (dockspaceType) {
      setName('');
      resetMutationRef.current();
    }
  }, [dockspaceType]);

  if (!dockspaceType) {
    return null;
  }

  const copy = dialogCopy(dockspaceType);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isPending || !name.trim()) {
      return;
    }

    let created: Dockspace;
    try {
      created = await createDockspace.mutateAsync({
        name: name.trim(),
        dockspaceType
      });
    } catch {
      // The mutation keeps the error; the dialog stays open and shows it.
      return;
    }

    await onCreated?.(created);
    onClose();
  };

  return (
    <div
      className={['dockspace-dialog-backdrop', backdropClassName].filter(Boolean).join(' ')}
      onMouseDown={onBackdropMouseDown}>
      <dialog
        ref={dialogRef}
        className="dockspace-dialog"
        open
        aria-modal="true"
        aria-label={copy.title}
        onCancel={(event) => {
          event.preventDefault();
          if (!isPending) {
            onClose();
          }
        }}
      >
        <h2 className="dockspace-dialog__title">{copy.title}</h2>
        <p className="dockspace-dialog__description">{copy.description}</p>
        <p className="dockspace-dialog__description">Choose a name to continue.</p>
        <form onSubmit={onSubmit}>
          <InputField
            id="dockspace-name"
            label="Dockspace Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={copy.placeholder}
            required
            disabled={isPending}
            autoFocus
          />
          {errorMessage ? <Alert message={errorMessage} /> : null}
          <div className="dockspace-dialog__actions">
            <Button ref={cancelRef} type="button" variant="secondary" disabled={isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? 'Creating...' : copy.confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
};
