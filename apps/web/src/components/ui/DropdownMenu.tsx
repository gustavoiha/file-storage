import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent,
  type MutableRefObject,
  type ReactElement,
  type ReactNode,
  type RefObject
} from 'react';

interface DropdownMenuContextValue {
  isOpen: boolean;
  close: () => void;
  toggle: () => void;
  triggerRef: RefObject<HTMLButtonElement>;
  contentRef: RefObject<HTMLDivElement>;
  openedFromTriggerRef: MutableRefObject<boolean>;
  openedWithKeyboardRef: MutableRefObject<boolean>;
}

interface DropdownMenuProps {
  children: ReactNode;
  className?: string;
  isOpen: boolean;
  onOpenChange: (nextOpen: boolean) => void;
}

type DropdownMenuTriggerProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>;

interface DropdownMenuContentProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  /**
   * 'checked' moves focus to the checked radio item (else the first enabled item) whenever the menu opens. By
   * default, a menu opened from the keyboard (Enter or Space on the trigger) focuses its first enabled item, and a
   * menu opened with a mouse click or a tap keeps focus on the trigger until an arrow key moves it into the menu.
   */
  initialFocus?: 'checked';
}

type DropdownMenuButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>;
interface DropdownMenuRadioItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'role'> {
  checked: boolean;
}
interface DropdownMenuLinkProps extends HTMLAttributes<HTMLElement> {
  asChild?: boolean;
}
type DropdownMenuSeparatorProps = HTMLAttributes<HTMLDivElement>;

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null);

const classNames = (...tokens: Array<string | undefined>) => tokens.filter(Boolean).join(' ');

const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

const isItemEnabled = (item: HTMLElement): boolean =>
  !item.hasAttribute('disabled') && item.getAttribute('aria-disabled') !== 'true';

/** Enabled menu items in DOM order. Separators have no menuitem role, so they are never included. */
const getEnabledItems = (content: HTMLElement | null): HTMLElement[] =>
  content ? Array.from(content.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)).filter(isItemEnabled) : [];

/** The first item after `fromIndex` (wrapping) whose text starts with `character`, for type-ahead. */
const findItemByFirstCharacter = (items: HTMLElement[], fromIndex: number, character: string): number => {
  const needle = character.toLocaleLowerCase();
  for (let offset = 1; offset <= items.length; offset += 1) {
    const index = (fromIndex + offset + items.length) % items.length;
    const text = (items[index]?.textContent ?? '').trim().toLocaleLowerCase();
    if (text.startsWith(needle)) {
      return index;
    }
  }

  return -1;
};

const useDropdownMenuContext = (): DropdownMenuContextValue => {
  const context = useContext(DropdownMenuContext);
  if (!context) {
    throw new Error('DropdownMenu compound components must be used inside DropdownMenu.');
  }

  return context;
};

const DropdownMenuRoot = ({ children, className, isOpen, onOpenChange }: DropdownMenuProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // True only when the menu was opened with the trigger button. Menus opened another way
  // (e.g. the phone long-press on a row) let their owner decide where focus goes on close.
  const openedFromTriggerRef = useRef(false);
  // True when the trigger opened the menu from the keyboard (or assistive technology), so the first item takes focus.
  const openedWithKeyboardRef = useRef(false);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const toggle = useCallback(() => {
    onOpenChange(!isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onDocumentPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const focusIsInMenu = Boolean(active && rootRef.current?.contains(active));

      if (event.key === 'Escape') {
        const shouldRefocusTrigger =
          focusIsInMenu && openedFromTriggerRef.current && active !== triggerRef.current;
        close();
        if (shouldRefocusTrigger) {
          triggerRef.current?.focus();
        }
        return;
      }

      if (!focusIsInMenu) {
        return;
      }

      const items = getEnabledItems(contentRef.current);
      if (items.length === 0) {
        return;
      }

      const currentIndex = active ? items.indexOf(active) : -1;
      let nextIndex: number;
      switch (event.key) {
        case 'ArrowDown':
          nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % items.length;
          break;
        case 'ArrowUp':
          nextIndex = currentIndex === -1 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
          break;
        case 'Home':
          nextIndex = 0;
          break;
        case 'End':
          nextIndex = items.length - 1;
          break;
        default: {
          // Type-ahead: a printable character moves to the next item starting with it.
          if (event.key.length !== 1 || event.key === ' ' || event.altKey || event.ctrlKey || event.metaKey) {
            return;
          }

          nextIndex = findItemByFirstCharacter(items, currentIndex, event.key);
          if (nextIndex === -1) {
            return;
          }
        }
      }

      event.preventDefault();
      items[nextIndex]?.focus();
    };

    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onDocumentKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [close, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      openedFromTriggerRef.current = false;
      openedWithKeyboardRef.current = false;
    }
  }, [isOpen]);

  const value = useMemo(
    () => ({
      isOpen,
      close,
      toggle,
      triggerRef,
      contentRef,
      openedFromTriggerRef,
      openedWithKeyboardRef
    }),
    [close, isOpen, toggle]
  );

  return (
    <DropdownMenuContext.Provider value={value}>
      <div ref={rootRef} className={classNames('dropdown-menu', className)}>
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
};

const DropdownMenuTrigger = ({ className, onClick, ...props }: DropdownMenuTriggerProps) => {
  const { isOpen, toggle, triggerRef, openedFromTriggerRef, openedWithKeyboardRef } = useDropdownMenuContext();

  return (
    <button
      {...props}
      ref={triggerRef}
      type="button"
      className={classNames('dropdown-menu__trigger', className)}
      aria-haspopup="menu"
      aria-expanded={isOpen}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          openedFromTriggerRef.current = !isOpen;
          // Enter and Space on a button, and activation by assistive technology, fire a click with detail 0;
          // a mouse click or a tap counts its presses (detail >= 1).
          openedWithKeyboardRef.current = !isOpen && event.detail === 0;
          toggle();
        }
      }}
    />
  );
};

const DropdownMenuContent = ({ className, label, initialFocus, ...props }: DropdownMenuContentProps) => {
  const { isOpen, contentRef, openedWithKeyboardRef } = useDropdownMenuContext();

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    const items = getEnabledItems(contentRef.current);
    if (initialFocus === 'checked') {
      const target = items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0];
      target?.focus();
    } else if (openedWithKeyboardRef.current) {
      items[0]?.focus();
    }
  }, [contentRef, initialFocus, isOpen, openedWithKeyboardRef]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      {...props}
      ref={contentRef}
      role="menu"
      aria-label={label}
      className={classNames('dropdown-menu__content', className)}
    />
  );
};

const DropdownMenuButton = ({ className, onClick, ...props }: DropdownMenuButtonProps) => {
  const { close } = useDropdownMenuContext();

  return (
    <button
      {...props}
      type="button"
      role="menuitem"
      className={classNames('dropdown-menu__item', className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          close();
        }
      }}
    />
  );
};

const DropdownMenuRadioItem = ({ className, onClick, checked, ...props }: DropdownMenuRadioItemProps) => {
  const { close } = useDropdownMenuContext();

  return (
    <button
      {...props}
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      className={classNames('dropdown-menu__item', className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          close();
        }
      }}
    />
  );
};

const DropdownMenuLink = ({ className, onClick, ...props }: DropdownMenuLinkProps) => {
  const { close } = useDropdownMenuContext();
  const onItemClick = (event: MouseEvent<HTMLElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented) {
      close();
    }
  };

  if (props.asChild) {
    const child = Children.only(props.children);
    if (!isValidElement(child)) {
      return null;
    }

    const childElement = child as ReactElement<any>;
    const childClassName = childElement.props.className as string | undefined;
    const childOnClick = childElement.props.onClick as
      | ((event: MouseEvent<HTMLElement>) => void)
      | undefined;

    return cloneElement(childElement, {
      className: classNames('dropdown-menu__item', className, childClassName),
      onClick: (event: MouseEvent<HTMLElement>) => {
        childOnClick?.(event);
        onItemClick(event);
      },
      role: 'menuitem'
    } as any);
  }

  const { asChild: _asChild, ...anchorProps } = props;

  return (
    <a
      {...anchorProps}
      role="menuitem"
      className={classNames('dropdown-menu__item', className)}
      onClick={onItemClick}
    />
  );
};

const DropdownMenuSeparator = ({ className, ...props }: DropdownMenuSeparatorProps) => (
  <div
    {...props}
    role="separator"
    aria-orientation="horizontal"
    className={classNames('dropdown-menu__separator', className)}
  />
);

export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  Button: DropdownMenuButton,
  Content: DropdownMenuContent,
  Link: DropdownMenuLink,
  RadioItem: DropdownMenuRadioItem,
  Separator: DropdownMenuSeparator,
  Trigger: DropdownMenuTrigger
});
