import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileList } from '@/components/files/FileList';

afterEach(() => {
  cleanup();
});

describe('FileList', () => {
  it('calls action', () => {
    const onAction = vi.fn();
    const onOpenFolder = vi.fn();
    const onCreateFolder = vi.fn();

    render(
      <FileList
        files={[
          {
            fullPath: '/x.txt',
            size: 1,
            state: 'ACTIVE'
          }
        ]}
        folders={[]}
        currentFolder="/"
        pendingFolderPaths={[]}
        actionLabel="Trash"
        onOpenFolder={onOpenFolder}
        onCreateFolder={onCreateFolder}
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
    expect(onAction).toHaveBeenCalledWith('/x.txt');
  });

  it('opens a folder and creates a folder', () => {
    const onAction = vi.fn();
    const onOpenFolder = vi.fn();
    const onCreateFolder = vi.fn();

    render(
      <FileList
        files={[]}
        folders={[
          {
            folderNodeId: 'f_docs',
            parentFolderNodeId: 'root',
            fullPath: '/docs',
            name: 'docs',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z'
          }
        ]}
        currentFolder="/"
        pendingFolderPaths={[]}
        actionLabel="Trash"
        onOpenFolder={onOpenFolder}
        onCreateFolder={onCreateFolder}
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /docs/i }));
    expect(onOpenFolder).toHaveBeenCalledWith('/docs');

    fireEvent.click(screen.getByRole('button', { name: '+ Add folder' }));
    fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'photos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onCreateFolder).toHaveBeenCalledWith('/photos');
  });

  it('shows pending folder placeholder', () => {
    const onAction = vi.fn();
    const onOpenFolder = vi.fn();
    const onCreateFolder = vi.fn();

    render(
      <FileList
        files={[]}
        folders={[]}
        currentFolder="/"
        pendingFolderPaths={['/photos']}
        actionLabel="Trash"
        onOpenFolder={onOpenFolder}
        onCreateFolder={onCreateFolder}
        onAction={onAction}
      />
    );

    expect(screen.getByText('photos')).toBeInTheDocument();
    expect(screen.getByText('Creating...')).toBeInTheDocument();
  });
});
