import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UploadForm } from '@/components/files/UploadForm';

const mutateAsync = vi.fn(async () => {});

vi.mock('@/hooks/useFiles', () => ({
  useUploadFile: () => ({
    mutateAsync,
    isPending: false
  })
}));

describe('UploadForm', () => {
  it('submits path and file', async () => {
    render(<UploadForm vaultId="v1" folder="/" />);

    const input = screen.getByLabelText('File') as HTMLInputElement;
    const file = new File(['hello'], 'x.txt', { type: 'text/plain' });

    fireEvent.change(screen.getByLabelText('Full path'), { target: { value: '/x.txt' } });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.submit(screen.getByRole('button', { name: 'Upload' }));

    expect(mutateAsync).toHaveBeenCalledWith({ fullPath: '/x.txt', file });
  });
});
