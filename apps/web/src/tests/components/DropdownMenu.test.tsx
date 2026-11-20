import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DropdownMenu } from '@/components/ui/DropdownMenu';

const TestMenu = ({ initialOpen = false }: { initialOpen?: boolean }) => {
  const [isOpen, setIsOpen] = useState(initialOpen);

  return (
    <DropdownMenu isOpen={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenu.Trigger aria-label="Open actions">⋯</DropdownMenu.Trigger>
      <DropdownMenu.Content label="Actions">
        <DropdownMenu.Button>Rename</DropdownMenu.Button>
        <DropdownMenu.Button disabled>Download</DropdownMenu.Button>
        <DropdownMenu.Separator />
        <DropdownMenu.Button>Move</DropdownMenu.Button>
        <DropdownMenu.Link asChild>
          <a href="/trash">Trash</a>
        </DropdownMenu.Link>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

const openMenu = ({ renderMenu = true }: { renderMenu?: boolean } = {}) => {
  if (renderMenu) {
    render(<TestMenu />);
  }
  const trigger = screen.getByRole('button', { name: 'Open actions' });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
};

const item = (name: string) => screen.getByRole('menuitem', { name });
const press = (key: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key });

describe('DropdownMenu keyboard navigation', () => {
  afterEach(cleanup);

  it('ArrowDown from the trigger focuses the first item, then moves down skipping disabled items and separators', () => {
    openMenu();

    press('ArrowDown');
    expect(item('Rename')).toHaveFocus();

    press('ArrowDown');
    expect(item('Move')).toHaveFocus();

    press('ArrowDown');
    expect(item('Trash')).toHaveFocus();
  });

  it('ArrowDown wraps from the last item to the first', () => {
    openMenu();
    item('Trash').focus();

    press('ArrowDown');
    expect(item('Rename')).toHaveFocus();
  });

  it('ArrowUp moves to the previous enabled item and wraps from the first to the last', () => {
    openMenu();
    item('Move').focus();

    press('ArrowUp');
    expect(item('Rename')).toHaveFocus();

    press('ArrowUp');
    expect(item('Trash')).toHaveFocus();
  });

  it('ArrowUp from the trigger focuses the last item', () => {
    openMenu();

    press('ArrowUp');
    expect(item('Trash')).toHaveFocus();
  });

  it('Home and End jump to the first and last enabled items', () => {
    openMenu();
    item('Move').focus();

    press('End');
    expect(item('Trash')).toHaveFocus();

    press('Home');
    expect(item('Rename')).toHaveFocus();
  });

  it('never focuses separators or disabled items', () => {
    openMenu();
    press('ArrowDown');

    const visited = new Set<Element | null>();
    for (let index = 0; index < 8; index += 1) {
      press('ArrowDown');
      visited.add(document.activeElement);
    }

    expect(visited.has(item('Download'))).toBe(false);
    expect(visited.has(screen.getByRole('separator'))).toBe(false);
    expect(visited.size).toBe(3);
  });

  it('prevents page scrolling for handled keys', () => {
    openMenu();
    item('Rename').focus();

    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    item('Rename').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Escape closes the menu and returns focus to the trigger', () => {
    const trigger = openMenu();
    press('ArrowDown');
    expect(item('Rename')).toHaveFocus();

    press('Escape');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('Escape does not move focus to the trigger when the menu was opened without it', () => {
    render(<TestMenu initialOpen />);
    item('Move').focus();

    press('Escape');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open actions' })).not.toHaveFocus();
  });

  it('ignores arrow keys when focus is outside the menu', () => {
    render(
      <>
        <TestMenu />
        <input aria-label="Search" />
      </>
    );
    openMenu({ renderMenu: false });
    const search = screen.getByRole('textbox', { name: 'Search' });
    search.focus();

    const onKeyDown = vi.fn((event: KeyboardEvent) => event.defaultPrevented);
    document.addEventListener('keydown', onKeyDown);
    press('ArrowDown');
    document.removeEventListener('keydown', onKeyDown);

    expect(search).toHaveFocus();
    expect(onKeyDown.mock.results[0]?.value).toBe(false);
  });
});
