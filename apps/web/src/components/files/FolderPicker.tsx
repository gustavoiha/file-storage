import { InputField } from '@/components/ui/InputField';

interface FolderPickerProps {
  folder: string;
  onChange: (value: string) => void;
}

export const FolderPicker = ({ folder, onChange }: FolderPickerProps) => (
  <InputField
    id="folder-picker"
    label="Folder"
    value={folder}
    onChange={(event) => onChange(event.target.value)}
    placeholder="/"
  />
);
