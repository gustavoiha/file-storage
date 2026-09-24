import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadForm } from '@/components/files/UploadForm';

const mutateAsync = vi.fn(async () => {});
const createFolderMutateAsync = vi.fn(async (folderPath: string) => ({
  folderPath,
  folderNodeId: 'folder-1',
  created: true
}));

vi.mock('@/hooks/useFiles', () => ({
  useUploadFile: () => ({
    mutateAsync,
    isPending: false
  }),
  useCreateFolder: () => ({
    mutateAsync: createFolderMutateAsync,
    isPending: false
  })
}));

describe('UploadForm', () => {
  beforeEach(() => {
    mutateAsync.mockClear();
    createFolderMutateAsync.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

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
    expect(createFolderMutateAsync).not.toHaveBeenCalled();
  });

  it('creates the folders of a folder selection before uploading its files', async () => {
    const { container } = render(<UploadForm dockspaceId="v1" folder="/photos" />);

    const input = container.querySelector('#upload-folder') as HTMLInputElement;
    const nested = new File(['a'], 'a.txt', { type: 'text/plain' });
    Object.defineProperty(nested, 'webkitRelativePath', { value: 'trip/day-1/a.txt' });

    fireEvent.change(input, { target: { files: [nested] } });

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(createFolderMutateAsync).toHaveBeenCalledWith('/photos/trip/day-1');
    expect(createFolderMutateAsync.mock.invocationCallOrder[0]!).toBeLessThan(
      mutateAsync.mock.invocationCallOrder[0]!
    );
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ fullPath: '/photos/trip/day-1/a.txt', file: nested })
    );
  });
});
