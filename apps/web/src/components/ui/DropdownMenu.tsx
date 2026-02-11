import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode
} from 'react';

interface DropdownMenuContextValue {
  isOpen: boolean;
  close: () => void;
  toggle: () => void;
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
}

type DropdownMenuButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>;
interface DropdownMenuLinkProps extends HTMLAttributes<HTMLElement> {
  asChild?: boolean;
}
type DropdownMenuSeparatorProps = HTMLAttributes<HTMLDivElement>;

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null);

const classNames = (...tokens: Array<string | undefined>) => tokens.filter(Boolean).join(' ');

const useDropdownMenuContext = (): DropdownMenuContextValue => {
  const context = useContext(DropdownMenuContext);
  if (!context) {
    throw new Error('DropdownMenu compound components must be used inside DropdownMenu.');
  }

  return context;
};

const DropdownMenuRoot = ({ children, className, isOpen, onOpenChange }: DropdownMenuProps) => {
  const rootRef = useRef<HTMLDivElement>(null);

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
      if (event.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('pointerdown', onDocumentPointerDown);
    document.addEventListener('keydown', onDocumentKeyDown);

    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [close, isOpen]);

  const value = useMemo(
    () => ({
      isOpen,
      close,
      toggle
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
  const { isOpen, toggle } = useDropdownMenuContext();

  return (
    <button
      {...props}
      type="button"
      className={classNames('dropdown-menu__trigger', className)}
      aria-haspopup="menu"
      aria-expanded={isOpen}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          toggle();
        }
      }}
    />
  );
};

const DropdownMenuContent = ({ className, label, ...props }: DropdownMenuContentProps) => {
  const { isOpen } = useDropdownMenuContext();
  if (!isOpen) {
    return null;
  }

  return (
    <div
      {...props}
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
  Separator: DropdownMenuSeparator,
  Trigger: DropdownMenuTrigger
});
