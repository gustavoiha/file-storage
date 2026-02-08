import { Button } from '@/components/ui/Button';
import type { FileRecord } from '@/lib/apiTypes';

interface FileListProps {
  files: FileRecord[];
  actionLabel: string;
  onAction: (fullPath: string) => void;
}

export const FileList = ({ files, actionLabel, onAction }: FileListProps) => {
  if (!files.length) {
    return <p>No files found.</p>;
  }

  return (
    <ul className="resource-list">
      {files.map((file) => (
        <li key={file.fullPath} className="resource-list__item resource-list__item--spaced">
          <div>
            <strong>{file.fullPath}</strong>
            <p>{file.size} bytes</p>
          </div>
          <Button variant="secondary" onClick={() => onAction(file.fullPath)}>
            {actionLabel}
          </Button>
        </li>
      ))}
    </ul>
  );
};
