import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UploadsCard } from '@/components/files/UploadsCard';
import type { ActiveUploadFile } from '@/hooks/useDockspaceUploadDialog';

const upload = (
  id: number,
  fullPath: string,
  status: ActiveUploadFile['status'],
  progress = 0
): ActiveUploadFile => ({
  id,
  file: new File(['x'], fullPath.split('/').pop() ?? 'x'),
  sourcePath: fullPath,
  destinationPath: fullPath,
  folderPath: '/',
  fullPath,
  status,
  progress
});

const baseProps = {
  activeUploads: [] as ActiveUploadFile[],
  skippedUploads: [],
  isPreparingFolders: false,
  uploadErrorMessage: null,
  onDismissSkippedUploads: vi.fn(),
  onRetryUpload: vi.fn()
};

afterEach(() => {
  cleanup();
});

describe('UploadsCard', () => {
  it('is hidden when there is nothing to show', () => {
    render(<UploadsCard {...baseProps} />);

    expect(screen.queryByRole('region', { name: 'Uploads' })).not.toBeInTheDocument();
  });

  it('shows active, waiting and failed uploads with retry', () => {
    const onRetryUpload = vi.fn();
    render(
      <UploadsCard
        {...baseProps}
        onRetryUpload={onRetryUpload}
        activeUploads={[
          upload(1, '/Lisbon/IMG_1.jpg', 'uploading', 64),
          upload(2, '/Lisbon/IMG_2.jpg', 'pending'),
          upload(3, '/Lisbon/IMG_3.jpg', 'failed')
        ]}
      />
    );

    const card = screen.getByRole('region', { name: 'Uploads' });
    expect(within(card).getByText('3 active')).toBeInTheDocument();
    expect(within(card).getByText('64%')).toBeInTheDocument();
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '64');
    expect(within(card).getByText('Waiting')).toBeInTheDocument();
    expect(within(card).getByText('Failed')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: 'Retry' }));
    expect(onRetryUpload).toHaveBeenCalledWith(3);
  });

  it('collapses to a summary pill and expands again', () => {
    render(
      <UploadsCard
        {...baseProps}
        activeUploads={[
          upload(1, '/a.jpg', 'uploading', 50),
          upload(2, '/b.jpg', 'uploading', 100),
          upload(3, '/c.jpg', 'pending')
        ]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Collapse uploads' }));
    const pill = screen.getByRole('button', { name: /Expand uploads/ });
    expect(pill).toHaveAttribute('aria-expanded', 'false');
    expect(pill).toHaveTextContent('Uploading 2 of 3 · 50%');

    fireEvent.click(pill);
    expect(screen.getByRole('button', { name: 'Collapse uploads' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('starts collapsed when asked to (phone)', () => {
    render(<UploadsCard {...baseProps} defaultCollapsed activeUploads={[upload(1, '/a.jpg', 'failed')]} />);

    expect(screen.getByRole('button', { name: 'Expand uploads: 1 upload failed, an upload failed' })).toBeInTheDocument();
  });

  it('shows skipped duplicates with details and dismiss', () => {
    const onDismissSkippedUploads = vi.fn();
    render(
      <UploadsCard
        {...baseProps}
        onDismissSkippedUploads={onDismissSkippedUploads}
        skippedUploads={[{ fullPath: '/dup.jpg', duplicateType: 'NAME', reason: 'Name exists' }]}
      />
    );

    expect(screen.getByText(/1 file skipped as duplicate/)).toBeInTheDocument();
    const details = screen.getByRole('button', { name: 'Details' });
    expect(details).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(details);
    expect(screen.getByText('/dup.jpg')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismissSkippedUploads).toHaveBeenCalledTimes(1);
  });

  it('shows the upload error message and creating folders state', () => {
    render(<UploadsCard {...baseProps} isPreparingFolders uploadErrorMessage="Upload failed badly" />);

    expect(screen.getByText('Creating folders…')).toBeInTheDocument();
    expect(screen.getByText('Upload failed badly')).toBeInTheDocument();
  });
});
