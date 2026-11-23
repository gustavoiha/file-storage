import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('moves focus to Collapse when Retry turns the failed row back into a waiting one', () => {
    const failed = [upload(3, '/Lisbon/IMG_3.jpg', 'failed')];
    const { rerender } = render(<UploadsCard {...baseProps} activeUploads={failed} />);

    const retry = screen.getByRole('button', { name: 'Retry' });
    retry.focus();
    fireEvent.click(retry);
    rerender(<UploadsCard {...baseProps} activeUploads={[upload(3, '/Lisbon/IMG_3.jpg', 'pending')]} />);

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse uploads' })).toHaveFocus();
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

  describe.each([
    ['desktop', false],
    ['phone', true]
  ] as const)('focus when collapsing and expanding (%s)', (_layout, defaultCollapsed) => {
    const activeUploads = [upload(1, '/a.jpg', 'uploading', 40)];

    const renderCard = () => {
      render(<UploadsCard {...baseProps} defaultCollapsed={defaultCollapsed} activeUploads={activeUploads} />);
      const section = screen.getByRole('region', { name: 'Uploads' });
      expect(section.classList.contains('dockspace-uploads--collapsed')).toBe(defaultCollapsed);
      if (defaultCollapsed) {
        // Start from the expanded card, as a phone user does after opening the pill.
        fireEvent.click(screen.getByRole('button', { name: /^Expand uploads/ }));
      }
    };

    it.each(['{Enter}', ' '])('keyboard %j on Collapse moves focus to the pill, and on the pill back to Collapse', async (key) => {
      const user = userEvent.setup();
      renderCard();

      screen.getByRole('button', { name: 'Collapse uploads' }).focus();
      await user.keyboard(key);
      const pill = screen.getByRole('button', { name: /^Expand uploads/ });
      expect(pill).toHaveFocus();
      expect(document.activeElement).not.toBe(document.body);

      await user.keyboard(key);
      expect(screen.getByRole('button', { name: 'Collapse uploads' })).toHaveFocus();

      // A second press keeps working: focus never falls to <body> in between.
      await user.keyboard(key);
      expect(screen.getByRole('button', { name: /^Expand uploads/ })).toHaveFocus();
    });

    it('a click on Collapse and then on the pill moves focus the same way', async () => {
      const user = userEvent.setup();
      renderCard();

      await user.click(screen.getByRole('button', { name: 'Collapse uploads' }));
      expect(screen.getByRole('button', { name: /^Expand uploads/ })).toHaveFocus();

      await user.click(screen.getByRole('button', { name: /^Expand uploads/ }));
      expect(screen.getByRole('button', { name: 'Collapse uploads' })).toHaveFocus();
    });
  });

  it('does not take focus when only defaultCollapsed changes', () => {
    const activeUploads = [upload(1, '/a.jpg', 'uploading', 40)];
    const { rerender } = render(<UploadsCard {...baseProps} activeUploads={activeUploads} />);

    rerender(<UploadsCard {...baseProps} defaultCollapsed activeUploads={activeUploads} />);
    expect(screen.getByRole('button', { name: /^Expand uploads/ })).not.toHaveFocus();

    rerender(<UploadsCard {...baseProps} defaultCollapsed={false} activeUploads={activeUploads} />);
    expect(screen.getByRole('button', { name: 'Collapse uploads' })).not.toHaveFocus();
  });

  it('starts collapsed when asked to (phone)', () => {
    render(<UploadsCard {...baseProps} defaultCollapsed activeUploads={[upload(1, '/a.jpg', 'failed')]} />);

    expect(screen.getByRole('button', { name: 'Expand uploads: 1 upload failed, an upload failed' })).toBeInTheDocument();
  });

  it('collapsed with only a skipped-files notice: no failure dot and no "an upload failed"', () => {
    const notice = '2 files were skipped because this gallery accepts only photos and videos.';
    render(<UploadsCard {...baseProps} defaultCollapsed uploadNoticeMessage={notice} />);

    const pill = screen.getByRole('button', { name: 'Expand uploads: Uploads, files were skipped' });
    expect(pill).toHaveTextContent('Uploads');
    expect(pill.querySelector('.dockspace-uploads__dot')).toBeNull();

    fireEvent.click(pill);
    const card = screen.getByRole('region', { name: 'Uploads' });
    const message = within(card).getByText(notice);
    expect(message).toHaveClass('dockspace-uploads__muted');
    expect(message).not.toHaveClass('dockspace-uploads__error');
  });

  it('collapsed with only skipped duplicates: says files were skipped, without a failure dot', () => {
    render(
      <UploadsCard
        {...baseProps}
        defaultCollapsed
        skippedUploads={[{ fullPath: '/dup.jpg', duplicateType: 'NAME', reason: 'Name exists' }]}
      />
    );

    const pill = screen.getByRole('button', { name: 'Expand uploads: Uploads, files were skipped' });
    expect(pill.querySelector('.dockspace-uploads__dot')).toBeNull();
  });

  it('collapsed with a failed upload: shows the failure dot and says an upload failed', () => {
    render(<UploadsCard {...baseProps} defaultCollapsed activeUploads={[upload(1, '/a.jpg', 'failed')]} />);

    const pill = screen.getByRole('button', { name: 'Expand uploads: 1 upload failed, an upload failed' });
    expect(pill.querySelector('.dockspace-uploads__dot')).not.toBeNull();
  });

  it('collapsed with an upload error message: shows the failure dot and says an upload failed', () => {
    render(<UploadsCard {...baseProps} defaultCollapsed uploadErrorMessage="Could not create the folders" />);

    const pill = screen.getByRole('button', { name: 'Expand uploads: Uploads, an upload failed' });
    expect(pill.querySelector('.dockspace-uploads__dot')).not.toBeNull();

    fireEvent.click(pill);
    expect(screen.getByText('Could not create the folders')).toHaveClass('dockspace-uploads__error');
  });

  it('collapsed with a failed upload and skipped files: reports both, with the failure dot', () => {
    render(
      <UploadsCard
        {...baseProps}
        defaultCollapsed
        activeUploads={[upload(1, '/a.jpg', 'uploading', 30), upload(2, '/b.jpg', 'failed')]}
        uploadNoticeMessage="1 file was skipped because this gallery accepts only photos and videos."
      />
    );

    const pill = screen.getByRole('button', {
      name: 'Expand uploads: Uploading 2 of 2 · 15%, an upload failed, files were skipped'
    });
    expect(pill.querySelector('.dockspace-uploads__dot')).not.toBeNull();
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
