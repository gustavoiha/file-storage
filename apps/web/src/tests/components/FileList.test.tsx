import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileList } from '@/components/files/FileList';

afterEach(() => {
  cleanup();
});

describe('FileList', () => {
  it('calls secondary action in flat mode', () => {
    const onAction = vi.fn();
    const onSecondaryAction = vi.fn();

    render(
      <FileList
        files={[
          {
            fullPath: '/x.txt',
            size: 1,
            state: 'TRASH'
          }
        ]}
        actionLabel="Restore"
        secondaryActionLabel="Purge now"
        secondaryActionVariant="danger"
        onSecondaryAction={onSecondaryAction}
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Purge now' }));
    expect(onSecondaryAction).toHaveBeenCalledWith('/x.txt');
  });

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

    fireEvent.click(screen.getByRole('button', { name: /actions for x.txt/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /trash/i }));
    expect(onAction).toHaveBeenCalledWith('/x.txt');
  });

  it('opens file viewer callback when clicking a file row', () => {
    const onAction = vi.fn();
    const onOpenFolder = vi.fn();
    const onOpenFile = vi.fn();

    render(
      <FileList
        files={[
          {
            fileNodeId: 'f_1',
            fullPath: '/x.txt',
            size: 1,
            state: 'ACTIVE'
          }
        ]}
        folders={[]}
        currentFolder="/"
        pendingFolderPaths={[]}
        actionLabel="Trash"
        onOpenFile={onOpenFile}
        onOpenFolder={onOpenFolder}
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByText('x.txt'));
    expect(onOpenFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileNodeId: 'f_1',
        fullPath: '/x.txt'
      })
    );
  });

  it('calls rename action when provided', () => {
    const onAction = vi.fn();
    const onOpenFolder = vi.fn();
    const onRename = vi.fn();

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
        renameActionLabel="Rename"
        onRename={onRename}
        onOpenFolder={onOpenFolder}
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /actions for x.txt/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename/i }));
    expect(onRename).toHaveBeenCalledWith('/x.txt');
  });

  it('calls download action when provided', () => {
    const onAction = vi.fn();
    const onOpenFolder = vi.fn();
    const onDownload = vi.fn();

    render(
      <FileList
        files={[
          {
            fileNodeId: 'file-123',
            fullPath: '/x.txt',
            size: 1,
            state: 'ACTIVE'
          }
        ]}
        folders={[]}
        currentFolder="/"
        pendingFolderPaths={[]}
        actionLabel="Trash"
        downloadActionLabel="Download"
        onDownload={onDownload}
        onOpenFolder={onOpenFolder}
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /actions for x.txt/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /download/i }));
    expect(onDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        fileNodeId: 'file-123',
        fullPath: '/x.txt'
      })
    );
  });

  it('opens actions menu on right click', () => {
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

    fireEvent.contextMenu(screen.getByText('x.txt'));
    fireEvent.click(screen.getByRole('menuitem', { name: /trash/i }));

    expect(onAction).toHaveBeenCalledWith('/x.txt');
  });

  it('toggles file selection when selection mode is active', () => {
    const onAction = vi.fn();
    const onOpenFolder = vi.fn();
    const onOpenFile = vi.fn();
    const onToggleFileSelection = vi.fn();

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
        selectedFilePaths={['/x.txt']}
        actionLabel="Trash"
        onToggleFileSelection={onToggleFileSelection}
        onOpenFile={onOpenFile}
        onOpenFolder={onOpenFolder}
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByText('x.txt'));
    expect(onToggleFileSelection).toHaveBeenCalledWith('/x.txt');
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it('renders folder checkbox placeholder when selection mode is active', () => {
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
        selectedFilePaths={['/x.txt']}
        actionLabel="Trash"
        onOpenFolder={onOpenFolder}
        onAction={onAction}
      />
    );

    expect(document.querySelector('.dockspace-browser__row-checkbox--disabled')).toBeInTheDocument();
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

  it('renames a folder from the folder actions menu', () => {
    const onAction = vi.fn();
    const onOpenFolder = vi.fn();
    const onRenameFolder = vi.fn();

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
        folderRenameActionLabel="Rename"
        onRenameFolder={onRenameFolder}
        onOpenFolder={onOpenFolder}
        onAction={onAction}
      />
    );

    fireEvent.contextMenu(screen.getByText('docs'));
    fireEvent.click(screen.getByRole('menuitem', { name: /rename/i }));
    expect(onRenameFolder).toHaveBeenCalledWith('/docs');
  });

  it('moves a folder to trash from folder actions menu', () => {
    const onAction = vi.fn();
    const onOpenFolder = vi.fn();
    const onActionFolder = vi.fn();

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
        actionLabel="Move to Trash"
        onActionFolder={onActionFolder}
        onOpenFolder={onOpenFolder}
        onAction={onAction}
      />
    );

    fireEvent.contextMenu(screen.getByText('docs'));
    fireEvent.click(screen.getByRole('menuitem', { name: /move to trash/i }));
    expect(onActionFolder).toHaveBeenCalledWith('/docs');
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

  it('shows pending trash folder placeholder', () => {
    const onAction = vi.fn();
    const onOpenFolder = vi.fn();

    render(
      <FileList
        files={[]}
        folders={[]}
        currentFolder="/"
        pendingFolderPaths={[]}
        pendingFolderTrashPaths={['/photos']}
        actionLabel="Move to Trash"
        onOpenFolder={onOpenFolder}
        onAction={onAction}
      />
    );

    expect(screen.getByText('photos')).toBeInTheDocument();
    expect(screen.getByText('Trashing...')).toBeInTheDocument();
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
        rootBreadcrumbLabel="My Dockspace"
        actionLabel="Trash"
        onOpenFolder={onOpenFolder}
        onAction={onAction}
      />
    );

    expect(screen.getByRole('button', { name: 'My Dockspace' })).toBeInTheDocument();
  });
});
