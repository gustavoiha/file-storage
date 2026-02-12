import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useCreateDockspace } from '@/hooks/useDockspaces';

interface CreateDockspaceFormProps {
  disabled?: boolean;
}

export const CreateDockspaceForm = ({ disabled = false }: CreateDockspaceFormProps) => {
  const createDockspace = useCreateDockspace();
  const [name, setName] = useState('');
  const isDisabled = disabled || createDockspace.isPending;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isDisabled || !name.trim()) {
      return;
    }

    await createDockspace.mutateAsync(name.trim());
    setName('');
  };

  return (
    <form onSubmit={onSubmit}>
      <InputField
        id="dockspace-name"
        label="Dockspace Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Personal Docs"
        required
        disabled={isDisabled}
      />
      <Button type="submit" disabled={isDisabled}>
        {createDockspace.isPending ? 'Creating...' : 'Create Dockspace'}
      </Button>
    </form>
  );
};
