import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FolderInfoPanel, summarizeFolderContents } from '@/components/files/FolderInfoPanel';
import type { DirectoryChildRecord, DirectoryChildrenRecord } from '@/lib/apiTypes';
import { clearSession, setSession } from '@/lib/authStore';
import { createTestQueryClient, QueryWrapper } from '@/tests/testUtils';

const { listFolderChildren } = vi.hoisted(() => ({
  listFolderChildren: vi.fn<(dockspaceId: string, folderNodeId: string) => Promise<DirectoryChildrenRecord>>()
}));

vi.mock('@/lib/dockspaceApi', () => ({ listFolderChildren }));

const TIMESTAMP = '2025-09-12T10:00:00.000Z';

const child = (
  childType: 'file' | 'folder',
  name: string,
  size?: number
): DirectoryChildRecord => ({
  childId: `${childType}-${name}`,
  childType,
  name,
  normalizedName: name.toLowerCase(),
  parentFolderNodeId: 'd_daytrips',
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
  ...(typeof size === 'number' ? { size } : {})
});

const listing = (items: DirectoryChildRecord[]): DirectoryChildrenRecord => ({
  parentFolderNodeId: 'd_daytrips',
  items
});

const DAY_TRIPS = {
  folderNodeId: 'd_daytrips',
  name: 'Day trips',
  createdAt: '2025-09-12T10:00:00.000Z',
  updatedAt: '2025-09-18T10:00:00.000Z'
};

const renderPanel = (props: Partial<Parameters<typeof FolderInfoPanel>[0]> = {}) => {
  const onClose = vi.fn();
  const onOpen = vi.fn();
  render(
    <QueryWrapper client={createTestQueryClient()}>
      <FolderInfoPanel
        dockspaceId="v1"
        folder={DAY_TRIPS}
        locationLabel="Personal Drive / Travel / Lisbon 2025"
        variant="side"
        onClose={onClose}
        onOpen={onOpen}
        {...props}
      />
    </QueryWrapper>
  );
  const name = props.folder?.name ?? DAY_TRIPS.name;
  return { onClose, onOpen, panel: screen.getByRole('complementary', { name: `Info for ${name}` }) };
};

const contents = () => screen.getByRole('list', { name: 'Contents' });

beforeEach(() => {
  setSession({ accessToken: 'a', idToken: 'i', email: 'a@a.com', userId: 'u1' });
  listFolderChildren.mockReset();
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe('summarizeFolderContents', () => {
  it('counts direct folders and files and sums the known file sizes', () => {
    expect(summarizeFolderContents([])).toEqual({ folderCount: 0, fileCount: 0, filesSize: null });
    expect(
      summarizeFolderContents([child('folder', 'a'), child('file', 'b', 100), child('file', 'c'), child('file', 'd', 24)])
    ).toEqual({ folderCount: 1, fileCount: 3, filesSize: 124 });
  });
});

describe('FolderInfoPanel', () => {
  it('shows the name, counts, files size, dates, location and the Esc hint (side variant)', async () => {
    listFolderChildren.mockResolvedValue(
      listing([
        child('folder', 'Sintra'),
        child('folder', 'Cascais'),
        child('file', 'a.jpg', 3 * 1024 * 1024),
        child('file', 'b.jpg', 1024 * 1024)
      ])
    );
    const { panel, onClose, onOpen } = renderPanel();

    expect(within(panel).getByRole('heading', { level: 2, name: 'Day trips' })).toBeInTheDocument();
    await waitFor(() => expect(within(contents()).getByText('2 folders')).toBeInTheDocument());
    expect(within(contents()).getByText('2 files')).toBeInTheDocument();
    expect(listFolderChildren).toHaveBeenCalledWith('v1', 'd_daytrips');

    const meta = panel.querySelector('dl') as HTMLElement;
    expect(within(meta).getByText('Files size')).toBeInTheDocument();
    expect(within(meta).getByText(/4\.0 MB/)).toBeInTheDocument();
    expect(within(meta).getByText('(files directly inside)')).toBeInTheDocument();
    expect(within(meta).getByText('Sep 12, 2025')).toBeInTheDocument();
    expect(within(meta).getByText('Sep 18, 2025')).toBeInTheDocument();
    expect(within(meta).getByText('Personal Drive / Travel / Lisbon 2025')).toHaveAttribute(
      'title',
      'Personal Drive / Travel / Lisbon 2025'
    );
    expect(within(panel).getByText('closes the info')).toBeInTheDocument();
    expect(within(panel).queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Open' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(within(panel).getByRole('button', { name: 'Close folder info' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses singular and plural correctly and hides Files size for an empty folder', async () => {
    listFolderChildren.mockResolvedValue(listing([]));
    const { panel } = renderPanel();

    await waitFor(() => expect(within(contents()).getByText('0 folders')).toBeInTheDocument());
    expect(within(contents()).getByText('0 files')).toBeInTheDocument();
    expect(within(panel).queryByText('Files size')).not.toBeInTheDocument();
  });

  it('counts a folder with only subfolders', async () => {
    listFolderChildren.mockResolvedValue(listing([child('folder', 'Sintra')]));
    const { panel } = renderPanel();

    await waitFor(() => expect(within(contents()).getByText('1 folder')).toBeInTheDocument());
    expect(within(contents()).getByText('0 files')).toBeInTheDocument();
    expect(within(panel).queryByText('Files size')).not.toBeInTheDocument();
  });

  it('counts a folder with only files', async () => {
    listFolderChildren.mockResolvedValue(listing([child('file', 'a.txt', 2048)]));
    const { panel } = renderPanel();

    await waitFor(() => expect(within(contents()).getByText('1 file')).toBeInTheDocument());
    expect(within(contents()).getByText('0 folders')).toBeInTheDocument();
    expect(within(panel).getByText(/2 KB/)).toBeInTheDocument();
  });

  it('shows a loading state while the contents load, with name, dates and location already there', async () => {
    let resolveListing: (value: DirectoryChildrenRecord) => void = () => {};
    listFolderChildren.mockReturnValue(
      new Promise((resolve) => {
        resolveListing = resolve;
      })
    );
    const { panel } = renderPanel();

    expect(within(panel).getByRole('status')).toHaveTextContent('Counting contents…');
    expect(within(panel).getByText('Sep 12, 2025')).toBeInTheDocument();
    expect(within(panel).getByText('Personal Drive / Travel / Lisbon 2025')).toBeInTheDocument();
    expect(within(contents()).getByText('folders')).toBeInTheDocument();
    expect(within(contents()).getByText('files')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Close folder info' })).toBeEnabled();
    expect(within(panel).queryByText('closes the info')).not.toBeInTheDocument();

    resolveListing(listing([child('file', 'a.txt')]));
    await waitFor(() => expect(within(contents()).getByText('1 file')).toBeInTheDocument());
    expect(within(panel).queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows an error alert with Try again when the contents fail to load, and retries', async () => {
    listFolderChildren.mockRejectedValueOnce(new Error('Network down'));
    const { panel } = renderPanel();

    const alert = await within(panel).findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't count what Day trips contains.");
    expect(within(panel).queryByRole('list', { name: 'Contents' })).not.toBeInTheDocument();
    expect(within(panel).queryByText('Files size')).not.toBeInTheDocument();
    expect(within(panel).getByText('Sep 18, 2025')).toBeInTheDocument();
    expect(within(panel).getByText('Personal Drive / Travel / Lisbon 2025')).toBeInTheDocument();

    listFolderChildren.mockResolvedValueOnce(listing([child('folder', 'Sintra'), child('file', 'a.txt')]));
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(within(contents()).getByText('1 folder')).toBeInTheDocument());
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
    expect(listFolderChildren).toHaveBeenCalledTimes(2);
  });

  it('keeps keyboard focus on Try again while a retry runs and after it fails again', async () => {
    listFolderChildren.mockRejectedValueOnce(new Error('Network down'));
    const { panel } = renderPanel();
    const alert = await within(panel).findByRole('alert');

    let rejectRetry: (error: Error) => void = () => undefined;
    listFolderChildren.mockImplementationOnce(
      () =>
        new Promise<DirectoryChildrenRecord>((_resolve, reject) => {
          rejectRetry = reject;
        })
    );
    const tryAgain = within(alert).getByRole('button', { name: 'Try again' });
    tryAgain.focus();
    fireEvent.click(tryAgain);

    // While the retry runs the alert stays, with the same button marked busy, instead of the loading state.
    const busy = await within(panel).findByRole('button', { name: 'Trying again…' });
    expect(busy).toBe(tryAgain);
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(tryAgain);
    expect(within(panel).queryByRole('status')).not.toBeInTheDocument();

    // A second activation while busy does not start another request.
    fireEvent.click(busy);
    expect(listFolderChildren).toHaveBeenCalledTimes(2);

    rejectRetry(new Error('Still down'));
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Try again' })).not.toHaveAttribute('aria-disabled'));
    expect(within(panel).getByRole('alert')).toHaveTextContent("Couldn't count what Day trips contains.");
    expect(document.activeElement).toBe(tryAgain);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('moves keyboard focus to Close when a retry from Try again succeeds', async () => {
    listFolderChildren.mockRejectedValueOnce(new Error('Network down'));
    const { panel } = renderPanel();
    const alert = await within(panel).findByRole('alert');

    listFolderChildren.mockResolvedValueOnce(listing([child('file', 'a.txt')]));
    const tryAgain = within(alert).getByRole('button', { name: 'Try again' });
    tryAgain.focus();
    fireEvent.click(tryAgain);

    await waitFor(() => expect(within(contents()).getByText('1 file')).toBeInTheDocument());
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(within(panel).getByRole('button', { name: 'Close folder info' }));
  });

  it('moves keyboard focus to the back button when a retry succeeds in the page variant', async () => {
    listFolderChildren.mockRejectedValueOnce(new Error('Network down'));
    const { panel } = renderPanel({ variant: 'page', backLabel: 'Back to Lisbon 2025' });
    const alert = await within(panel).findByRole('alert');

    listFolderChildren.mockResolvedValueOnce(listing([]));
    const tryAgain = within(alert).getByRole('button', { name: 'Try again' });
    tryAgain.focus();
    fireEvent.click(tryAgain);

    await waitFor(() => expect(within(contents()).getByText('0 files')).toBeInTheDocument());
    expect(document.activeElement).toBe(within(panel).getByRole('button', { name: 'Back to Lisbon 2025' }));
  });

  it('still hands the Close button to the page as its focus target', () => {
    listFolderChildren.mockReturnValue(new Promise(() => undefined));
    const focusTargetRef = createRef<HTMLButtonElement>();
    const { panel } = renderPanel({ focusTargetRef });
    expect(focusTargetRef.current).toBe(within(panel).getByRole('button', { name: 'Close folder info' }));
  });

  it('renders the page variant with a back button, an h1 and no Close button or Esc hint', async () => {
    listFolderChildren.mockResolvedValue(listing([]));
    const { panel, onClose } = renderPanel({ variant: 'page', backLabel: 'Back to Lisbon 2025' });

    expect(within(panel).getByRole('heading', { level: 1, name: 'Day trips' })).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Close folder info' })).not.toBeInTheDocument();
    await waitFor(() => expect(within(contents()).getByText('0 files')).toBeInTheDocument());
    expect(within(panel).queryByText('closes the info')).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Back to Lisbon 2025' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('omits Open, Location and unknown dates for the dockspace root', async () => {
    listFolderChildren.mockResolvedValue(listing([]));
    const { panel } = renderPanel({
      folder: { folderNodeId: 'root', name: 'Personal Drive' },
      locationLabel: null,
      onOpen: undefined
    });

    await waitFor(() => expect(within(contents()).getByText('0 folders')).toBeInTheDocument());
    expect(within(panel).queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
    expect(within(panel).queryByText('Location')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Created')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Modified')).not.toBeInTheDocument();
  });
});
