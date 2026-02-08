import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useUploadFile } from '@/hooks/useFiles';

interface UploadFormProps {
  vaultId: string;
  folder: string;
}

export const UploadForm = ({ vaultId, folder }: UploadFormProps) => {
  const uploadMutation = useUploadFile(vaultId, folder);
  const [fullPath, setFullPath] = useState(folder === '/' ? '/' : folder);
  const [file, setFile] = useState<File | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || !fullPath.trim()) {
      return;
    }

    await uploadMutation.mutateAsync({
      fullPath,
      file
    });
    setFile(null);
  };

  return (
    <form onSubmit={onSubmit}>
      <InputField
        id="upload-full-path"
        label="Full path"
        value={fullPath}
        onChange={(event) => setFullPath(event.target.value)}
        placeholder="/photos/2026/image.jpg"
      />
      <label className="ui-field" htmlFor="upload-file">
        <span className="ui-field__label">File</span>
        <input
          id="upload-file"
          className="ui-input"
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          required
        />
      </label>
      <Button type="submit" disabled={uploadMutation.isPending}>
        {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
      </Button>
    </form>
  );
};
