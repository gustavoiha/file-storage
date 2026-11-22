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

// A mouse click or a tap reports its press count in `detail`; Enter and Space on a button (and activation by
// assistive technology) fire a click with detail 0.
const MOUSE_CLICK = { detail: 1 };
const KEYBOARD_CLICK = { detail: 0 };

const openMenu = ({ renderMenu = true }: { renderMenu?: boolean } = {}) => {
  if (renderMenu) {
    render(<TestMenu />);
  }
  const trigger = screen.getByRole('button', { name: 'Open actions' });
  trigger.focus();
  fireEvent.click(trigger, MOUSE_CLICK);
  return trigger;
};

/** Enter or Space on the focused trigger: the browser fires keydown, then a click with detail 0. */
const openMenuWithKeyboard = (key: 'Enter' | ' ', name = 'Open actions') => {
  const trigger = screen.getByRole('button', { name });
  trigger.focus();
  fireEvent.keyDown(trigger, { key });
  fireEvent.click(trigger, KEYBOARD_CLICK);
  if (key === ' ') {
    fireEvent.keyUp(trigger, { key });
  }
  return trigger;
};

const item = (name: string) => screen.getByRole('menuitem', { name });
const press = (key: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key });

describe('DropdownMenu opened from the keyboard', () => {
  afterEach(cleanup);

  it.each([
    ['Enter', 'Enter'],
    ['Space', ' ']
  ] as const)('%s on the trigger opens the menu with focus on the first enabled item', (_name, key) => {
    render(<TestMenu />);
    const trigger = openMenuWithKeyboard(key);

    expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(item('Rename')).toHaveFocus();
  });

  it('skips disabled items and separators to reach the first enabled item', () => {
    const DisabledFirstMenu = () => {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <DropdownMenu isOpen={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenu.Trigger aria-label="Open actions">⋯</DropdownMenu.Trigger>
          <DropdownMenu.Content label="Actions">
            <DropdownMenu.Button disabled>Download</DropdownMenu.Button>
            <DropdownMenu.Button aria-disabled="true">Share</DropdownMenu.Button>
            <DropdownMenu.Separator />
            <DropdownMenu.Button>Move</DropdownMenu.Button>
          </DropdownMenu.Content>
        </DropdownMenu>
      );
    };
    render(<DisabledFirstMenu />);
    openMenuWithKeyboard('Enter');

    expect(item('Move')).toHaveFocus();
  });

  it('arrow keys, Home and End keep working from the first item, with wrap-around', () => {
    render(<TestMenu />);
    openMenuWithKeyboard('Enter');

    press('ArrowDown');
    expect(item('Move')).toHaveFocus();
    press('End');
    expect(item('Trash')).toHaveFocus();
    press('ArrowDown');
    expect(item('Rename')).toHaveFocus();
    press('ArrowUp');
    expect(item('Trash')).toHaveFocus();
    press('Home');
    expect(item('Rename')).toHaveFocus();
  });

  it('Escape closes the menu and returns focus to the trigger', () => {
    render(<TestMenu />);
    const trigger = openMenuWithKeyboard('Enter');
    expect(item('Rename')).toHaveFocus();

    press('Escape');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('a mouse click after a keyboard open does not move focus into the menu', () => {
    render(<TestMenu />);
    const trigger = openMenuWithKeyboard('Enter');
    press('Escape');

    fireEvent.click(trigger, MOUSE_CLICK);
    expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('a menu opened without the trigger does not move focus', () => {
    render(
      <>
        <TestMenu initialOpen />
        <input aria-label="Search" />
      </>
    );
    const search = screen.getByRole('textbox', { name: 'Search' });
    search.focus();

    expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument();
    expect(search).toHaveFocus();
  });
});

describe('DropdownMenu keyboard navigation', () => {
  afterEach(cleanup);

  it('a mouse click or a tap leaves focus on the trigger', () => {
    const trigger = openMenu();

    expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

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

const RadioMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [current, setCurrent] = useState('Japan');

  return (
    <DropdownMenu isOpen={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenu.Trigger aria-label="Album">{current}</DropdownMenu.Trigger>
      <DropdownMenu.Content label="Albums" initialFocus="checked">
        {['All media', 'Japan', 'Lisbon', 'Pets'].map((name) => (
          <DropdownMenu.RadioItem key={name} checked={current === name} onClick={() => setCurrent(name)}>
            {name}
          </DropdownMenu.RadioItem>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

describe('DropdownMenu radio items', () => {
  afterEach(cleanup);

  const radio = (name: string) => screen.getByRole('menuitemradio', { name });

  it('opens with focus on the checked item and marks it with aria-checked', () => {
    render(<RadioMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Album' }), MOUSE_CLICK);

    expect(screen.getByRole('menu', { name: 'Albums' })).toBeInTheDocument();
    expect(radio('Japan')).toHaveAttribute('aria-checked', 'true');
    expect(radio('Lisbon')).toHaveAttribute('aria-checked', 'false');
    expect(radio('Japan')).toHaveFocus();
  });

  it.each([
    ['Enter', 'Enter'],
    ['Space', ' ']
  ] as const)('opened with %s, focuses the checked item, not the first one', (_name, key) => {
    render(<RadioMenu />);
    openMenuWithKeyboard(key, 'Album');

    expect(radio('Japan')).toHaveFocus();
  });

  it('moves between radio items with arrow keys, Home and End, and by first letter', () => {
    render(<RadioMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Album' }));

    press('ArrowDown');
    expect(radio('Lisbon')).toHaveFocus();
    press('End');
    expect(radio('Pets')).toHaveFocus();
    press('Home');
    expect(radio('All media')).toHaveFocus();
    press('ArrowUp');
    expect(radio('Pets')).toHaveFocus();
    press('l');
    expect(radio('Lisbon')).toHaveFocus();
    press('J');
    expect(radio('Japan')).toHaveFocus();
    press('z');
    expect(radio('Japan')).toHaveFocus();
  });

  it('checks the chosen item and closes; Escape closes and returns focus to the trigger', () => {
    render(<RadioMenu />);
    const trigger = screen.getByRole('button', { name: 'Album' });
    fireEvent.click(trigger);
    fireEvent.click(radio('Pets'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent('Pets');

    fireEvent.click(trigger);
    expect(radio('Pets')).toHaveFocus();
    press('Escape');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
