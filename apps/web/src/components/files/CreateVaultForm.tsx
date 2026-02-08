import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { InputField } from '@/components/ui/InputField';
import { useCreateVault } from '@/hooks/useVaults';

export const CreateVaultForm = () => {
  const createVault = useCreateVault();
  const [name, setName] = useState('');

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim()) {
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
      />
      <Button type="submit" disabled={createVault.isPending}>
        {createVault.isPending ? 'Creating...' : 'Create Vault'}
      </Button>
    </form>
  );
};
