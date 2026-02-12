import { Button } from '@/components/ui/Button';
import type { StagedUploadFile } from '@/hooks/useDockspaceUploadDialog';

interface UploadStagingListProps {
  emptyStateMessage?: string;
  isSubmitting: boolean;
  stagedFiles: StagedUploadFile[];
  onFileNameChange: (id: number, name: string) => void;
  onRemoveFile: (id: number) => void;
}

export const UploadStagingList = ({
  emptyStateMessage,
  isSubmitting,
  stagedFiles,
  onFileNameChange,
  onRemoveFile
}: UploadStagingListProps) => {
  if (!stagedFiles.length) {
    return emptyStateMessage ? <p className="auth-note">{emptyStateMessage}</p> : null;
  }

  return (
    <ul className="upload-staging-list">
      {stagedFiles.map((stagedFile) => (
        <li key={stagedFile.id} className="upload-staging-list__item">
          <p className="upload-staging-list__meta">
            Original file: {stagedFile.file.name} ({stagedFile.file.size} bytes)
          </p>
          <label className="ui-field" htmlFor={`upload-name-${stagedFile.id}`}>
            <span className="ui-field__label">File name</span>
            <input
              id={`upload-name-${stagedFile.id}`}
              className="ui-input"
              value={stagedFile.name}
              onChange={(event) => onFileNameChange(stagedFile.id, event.target.value)}
              disabled={isSubmitting}
            />
          </label>
          <div className="upload-staging-list__actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onRemoveFile(stagedFile.id)}
              disabled={isSubmitting}
            >
              Remove
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
};
