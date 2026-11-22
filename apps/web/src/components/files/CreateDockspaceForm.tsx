import { useState } from 'react';
import { Plus } from 'lucide-react';
import { CreateDockspaceDialog } from '@/components/files/CreateDockspaceDialog';
import type { DockspaceType } from '@/lib/apiTypes';

interface CreateDockspaceFormProps {
  disabled?: boolean;
}

export const CreateDockspaceForm = ({ disabled = false }: CreateDockspaceFormProps) => {
  const [selectedType, setSelectedType] = useState<DockspaceType | null>(null);

  const openDialog = (dockspaceType: DockspaceType) => {
    if (disabled) {
      return;
    }

    setSelectedType(dockspaceType);
  };

  return (
    <>
      <div className="dockspace-create-picker dockspace-create-picker--in-grid">
        <button
          type="button"
          className="dockspace-card dockspace-card--create dockspace-card--generic"
          disabled={disabled}
          onClick={() => openDialog('GENERIC_FILES')}
        >
          <span className="dockspace-card__create-plus" aria-hidden="true">
            <Plus size={54} strokeWidth={1.8} />
          </span>
          <span className="dockspace-card__title">Generic Files</span>
        </button>
        <button
          type="button"
          className="dockspace-card dockspace-card--create dockspace-card--media"
          disabled={disabled}
          onClick={() => openDialog('PHOTOS_VIDEOS')}
        >
          <span className="dockspace-card__create-plus" aria-hidden="true">
            <Plus size={54} strokeWidth={1.8} />
          </span>
          <span className="dockspace-card__title">Photos &amp; Videos</span>
        </button>
      </div>

      <CreateDockspaceDialog dockspaceType={selectedType} onClose={() => setSelectedType(null)} />
    </>
  );
};
