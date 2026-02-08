import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FileList } from '@/components/files/FileList';

describe('FileList', () => {
  it('calls action', () => {
    const onAction = vi.fn();

    render(
      <FileList
        files={[
          {
            fullPath: '/x.txt',
            size: 1,
            state: 'ACTIVE'
          }
        ]}
        actionLabel="Trash"
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trash' }));
    expect(onAction).toHaveBeenCalledWith('/x.txt');
  });
});
