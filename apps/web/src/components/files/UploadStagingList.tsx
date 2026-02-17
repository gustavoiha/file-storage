import { Button } from '@/components/ui/Button';
import type { ActiveUploadFile } from '@/hooks/useDockspaceUploadDialog';

interface UploadStagingListProps {
  emptyStateMessage?: string;
  onRetryUpload?: (uploadId: number) => void;
  stagedFiles: ActiveUploadFile[];
}

export const UploadStagingList = ({ emptyStateMessage, onRetryUpload, stagedFiles }: UploadStagingListProps) => {
  if (!stagedFiles.length) {
    return emptyStateMessage ? <p className="auth-note">{emptyStateMessage}</p> : null;
  }

  return (
    <ul className="upload-staging-list">
      {stagedFiles.map((stagedFile) => (
        <li key={stagedFile.id} className="upload-staging-list__item">
          <p className="upload-staging-list__meta">{stagedFile.fullPath}</p>
          <div className="upload-staging-list__progress">
            <div className="upload-staging-list__progress-bar" style={{ width: `${stagedFile.progress}%` }} />
          </div>
          <p className="upload-staging-list__status">
            {stagedFile.status === 'uploading'
              ? `Uploading... ${stagedFile.progress}%`
              : stagedFile.status === 'pending'
                ? 'Waiting to upload'
                : stagedFile.errorMessage ?? 'Upload failed.'}
          </p>
          {stagedFile.status === 'failed' && onRetryUpload ? (
            <div className="upload-staging-list__actions">
              <Button type="button" variant="secondary" onClick={() => onRetryUpload(stagedFile.id)}>
                Retry
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
};
