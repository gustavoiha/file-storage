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
  it('uploads selected files immediately', async () => {
    render(<UploadForm dockspaceId="v1" folder="/photos/2026" />);

    const input = screen.getByLabelText('Files') as HTMLInputElement;
    const firstFile = new File(['hello'], 'x.txt', { type: 'text/plain' });
    const secondFile = new File(['world'], 'report.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [firstFile, secondFile] } });

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fullPath: '/photos/2026/x.txt',
        file: firstFile,
        onProgress: expect.any(Function)
      })
    );
    expect(mutateAsync).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fullPath: '/photos/2026/report.pdf',
        file: secondFile,
        onProgress: expect.any(Function)
      })
    );
  });
});
