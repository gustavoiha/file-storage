import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  it('stages multiple files and uploads them with editable names', async () => {
    render(<UploadForm dockspaceId="v1" folder="/photos/2026" />);

    const input = screen.getByLabelText('Files') as HTMLInputElement;
    const firstFile = new File(['hello'], 'x.txt', { type: 'text/plain' });
    const secondFile = new File(['world'], 'report.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [firstFile, secondFile] } });
    fireEvent.change(screen.getByDisplayValue('report.pdf'), {
      target: { value: 'report-final.pdf' }
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Upload Files' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync).toHaveBeenNthCalledWith(1, {
      fullPath: '/photos/2026/x.txt',
      file: firstFile
    });
    expect(mutateAsync).toHaveBeenNthCalledWith(2, {
      fullPath: '/photos/2026/report-final.pdf',
      file: secondFile
    });
  });
});
