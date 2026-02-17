import { useMemo, useState, type FormEvent } from 'react';
import { Film, FolderOpen } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useCreateDockspace } from '@/hooks/useDockspaces';
import type { DockspaceType } from '@/lib/apiTypes';

interface CreateDockspaceFormProps {
  disabled?: boolean;
}

export const CreateDockspaceForm = ({ disabled = false }: CreateDockspaceFormProps) => {
  const createDockspace = useCreateDockspace();
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState<DockspaceType | null>(null);
  const isDisabled = disabled || createDockspace.isPending;
  const title = useMemo(() => {
    if (selectedType === 'PHOTOS_VIDEOS') {
      return 'Create Photos & Videos Dockspace';
    }

    return 'Create Generic Files Dockspace';
  }, [selectedType]);
  const confirmButtonLabel = useMemo(() => {
    if (selectedType === 'PHOTOS_VIDEOS') {
      return createDockspace.isPending ? 'Creating...' : 'Create Media Dockspace';
    }

    return createDockspace.isPending ? 'Creating...' : 'Create Generic Dockspace';
  }, [createDockspace.isPending, selectedType]);

  const openDialog = (dockspaceType: DockspaceType) => {
    if (isDisabled) {
      return;
    }

    setName('');
    setSelectedType(dockspaceType);
  };

  const closeDialog = () => {
    if (createDockspace.isPending) {
      return;
    }

    setName('');
    setSelectedType(null);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isDisabled || !selectedType || !name.trim()) {
      return;
    }

    await createDockspace.mutateAsync({
      name: name.trim(),
      dockspaceType: selectedType
    });
    setName('');
    setSelectedType(null);
  };

  return (
    <>
      {createDockspace.error instanceof Error ? <Alert message={createDockspace.error.message} /> : null}
      <div className="dockspace-create-picker">
        <button
          type="button"
          className="dockspace-create-picker__tile dockspace-create-picker__tile--generic"
          disabled={isDisabled}
          onClick={() => openDialog('GENERIC_FILES')}
        >
          <span className="dockspace-create-picker__tile-icon" aria-hidden="true">
            <FolderOpen size={24} />
          </span>
          <span className="dockspace-create-picker__tile-title">Generic Files</span>
          <span className="dockspace-create-picker__tile-description">
            Structured folders and files for documents, source code, archives, and everything else.
          </span>
        </button>
        <button
          type="button"
          className="dockspace-create-picker__tile dockspace-create-picker__tile--media"
          disabled={isDisabled}
          onClick={() => openDialog('PHOTOS_VIDEOS')}
        >
          <span className="dockspace-create-picker__tile-icon" aria-hidden="true">
            <Film size={24} />
          </span>
          <span className="dockspace-create-picker__tile-title">Photos &amp; Videos</span>
          <span className="dockspace-create-picker__tile-description">
            Folderless media workspace with album organization and media-only upload rules.
          </span>
        </button>
      </div>

      {selectedType ? (
        <div className="dockspace-dialog-backdrop">
          <dialog
            className="dockspace-dialog"
            open
            aria-modal="true"
            aria-label={title}
            onCancel={(event) => {
              event.preventDefault();
              closeDialog();
            }}
          >
            <h3 className="dockspace-dialog__title">{title}</h3>
            <p className="dockspace-dialog__description">
              Confirm the dockspace type and choose a name to continue.
            </p>
            <form onSubmit={onSubmit}>
              <InputField
                id="dockspace-name"
                label="Dockspace Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={selectedType === 'PHOTOS_VIDEOS' ? 'Camera Roll' : 'Personal Docs'}
                required
                disabled={isDisabled}
              />
              <div className="dockspace-dialog__actions">
                <Button type="button" variant="secondary" disabled={isDisabled} onClick={closeDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isDisabled || !name.trim()}>
                  {confirmButtonLabel}
                </Button>
              </div>
            </form>
          </dialog>
        </div>
      ) : null}
    </>
  );
};
