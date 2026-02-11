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
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Trash/i }));
    expect(onAction).toHaveBeenCalledWith('/x.txt');
  });

  it('opens a folder', () => {
    const onAction = vi.fn();
    const onOpenFolder = vi.fn();

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
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /docs/i }));
    expect(onOpenFolder).toHaveBeenCalledWith('/docs');
  });

  it('shows pending folder placeholder', () => {
    const onAction = vi.fn();
    const onOpenFolder = vi.fn();

    render(
      <FileList
        files={[]}
        folders={[]}
        currentFolder="/"
        pendingFolderPaths={['/photos']}
        actionLabel="Trash"
        onOpenFolder={onOpenFolder}
        onAction={onAction}
      />
    );

    expect(screen.getByText('photos')).toBeInTheDocument();
    expect(screen.getByText('Creating...')).toBeInTheDocument();
  });

  it('uses custom root breadcrumb label', () => {
    const onAction = vi.fn();
    const onOpenFolder = vi.fn();

    render(
      <FileList
        files={[]}
        folders={[]}
        currentFolder="/"
        pendingFolderPaths={[]}
        rootBreadcrumbLabel="My Vault"
        actionLabel="Trash"
        onOpenFolder={onOpenFolder}
        onAction={onAction}
      />
    );

    expect(screen.getByRole('button', { name: 'My Vault' })).toBeInTheDocument();
  });
});
