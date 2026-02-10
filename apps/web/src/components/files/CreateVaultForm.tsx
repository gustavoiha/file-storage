import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useCreateVault } from '@/hooks/useVaults';

interface CreateVaultFormProps {
  disabled?: boolean;
}

export const CreateVaultForm = ({ disabled = false }: CreateVaultFormProps) => {
  const createVault = useCreateVault();
  const [name, setName] = useState('');
  const isDisabled = disabled || createVault.isPending;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isDisabled || !name.trim()) {
      return;
    }

    await createVault.mutateAsync(name.trim());
    setName('');
  };

  return (
    <form onSubmit={onSubmit}>
      <InputField
        id="vault-name"
        label="Vault Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Personal Docs"
        required
        disabled={isDisabled}
      />
      <Button type="submit" disabled={isDisabled}>
        {createVault.isPending ? 'Creating...' : 'Create Vault'}
      </Button>
    </form>
  );
};
