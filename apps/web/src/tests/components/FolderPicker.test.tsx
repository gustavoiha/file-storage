import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FolderPicker } from '@/components/files/FolderPicker';

describe('FolderPicker', () => {
  it('emits folder changes', () => {
    const onChange = vi.fn();
    render(<FolderPicker folder="/" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: '/docs' } });
    expect(onChange).toHaveBeenCalledWith('/docs');
  });
});
