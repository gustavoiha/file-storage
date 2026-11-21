import { useEffect, useRef, type MouseEventHandler } from 'react';

interface UseDialogDismissOptions {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Called when the dialog closes. Return the element that should take focus (e.g. the row
   * of a renamed item after a submit), null while that element has not rendered yet, or
   * undefined to return focus to the opener.
   */
  getReturnFocusTarget?: (() => HTMLElement | null | undefined) | undefined;
}

/** Marks the element that takes focus when neither the preferred target nor the opener can. */
export const DIALOG_FOCUS_FALLBACK_ATTRIBUTE = 'data-dialog-focus-fallback';
/** Marks the focusable row element of a file or folder; the value is its full path. */
export const ROW_PATH_ATTRIBUTE = 'data-row-path';
/** Set to "row" on a menu opened from its row (right-click, press and hold, ContextMenu key). */
export const MENU_RETURN_FOCUS_ATTRIBUTE = 'data-return-focus';

const PREFERRED_TARGET_ATTEMPTS = 5;

export const findRowByPath = (fullPath: string): HTMLElement | null => {
  for (const element of document.querySelectorAll<HTMLElement>(`[${ROW_PATH_ATTRIBUTE}]`)) {
    if (element.getAttribute(ROW_PATH_ATTRIBUTE) === fullPath) {
      return element;
    }
  }

  return null;
};

export const isFocusable = (element: HTMLElement | null | undefined): element is HTMLElement =>
  Boolean(
    element &&
      element.isConnected &&
      !(element as HTMLButtonElement).disabled &&
      element.getAttribute('aria-hidden') !== 'true'
  );

/**
 * The element a dialog was opened from. A menu item is removed when its menu closes,
 * so it resolves to the menu trigger, or to the row when the menu was opened from the row.
 */
export const resolveOpener = (active: Element | null): HTMLElement | null => {
  if (!(active instanceof HTMLElement) || active === document.body) {
    return null;
  }

  const menu = active.closest<HTMLElement>('[role="menu"]');
  if (!menu) {
    return active;
  }

  const rowButton = menu.closest('li')?.querySelector<HTMLElement>(`[${ROW_PATH_ATTRIBUTE}]`) ?? null;
  if (menu.getAttribute(MENU_RETURN_FOCUS_ATTRIBUTE) === 'row' && rowButton) {
    return rowButton;
  }

  const trigger = Array.from(menu.closest('.dropdown-menu')?.children ?? []).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.classList.contains('dropdown-menu__trigger')
  );

  return trigger ?? rowButton;
};

const TABBABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

/**
 * Tab and Shift+Tab wrap around the dialog's controls, so keyboard focus does not leave it
 * for the page behind it. Focus outside the dialog (e.g. on body after the focused button was
 * disabled during a submit) moves to its first or last control; with no control to take
 * focus, Tab is swallowed.
 */
const trapTabKey = (dialog: HTMLElement, event: KeyboardEvent) => {
  if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const tabbable = Array.from(dialog.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
    (element) => element.getAttribute('aria-hidden') !== 'true'
  );
  const first = tabbable[0];
  const last = tabbable[tabbable.length - 1];
  if (!first || !last) {
    event.preventDefault();
    return;
  }

  const active = document.activeElement;
  const activeIndex = active instanceof HTMLElement ? tabbable.indexOf(active) : -1;
  if (event.shiftKey && activeIndex <= 0) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (activeIndex === -1 || activeIndex === tabbable.length - 1)) {
    event.preventDefault();
    first.focus();
  }
};

/**
 * Keeps Tab and Shift+Tab inside a modal dialog while it is open. Attach the returned ref to
 * the dialog element. The listener is on the document, not the dialog, because focus can sit on
 * body (a disabled button loses focus while submitting, and it stays there after a failure),
 * and a Tab from body never reaches the dialog's own handlers.
 */
export const useDialogTabTrap = <T extends HTMLElement>(isOpen: boolean) => {
  const dialogRef = useRef<T>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (dialog?.isConnected) {
        trapTabKey(dialog, event);
      }
    };

    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [isOpen]);

  return dialogRef;
};

export const focusIsLost = () => {
  const active = document.activeElement;
  return !active || active === document.body;
};

export const useDialogDismiss = ({ isOpen, onClose, getReturnFocusTarget }: UseDialogDismissOptions) => {
  const openerRef = useRef<HTMLElement | null | undefined>(undefined);
  const wasOpenRef = useRef(isOpen);
  const getReturnFocusTargetRef = useRef(getReturnFocusTarget);
  getReturnFocusTargetRef.current = getReturnFocusTarget;

  // Read the opener while rendering the opening update: by the time effects run,
  // the dialog's autofocused field already holds focus.
  if (isOpen && openerRef.current === undefined) {
    openerRef.current = resolveOpener(document.activeElement);
  }

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      return;
    }

    if (!wasOpenRef.current) {
      return;
    }

    wasOpenRef.current = false;
    const opener = openerRef.current ?? null;
    openerRef.current = undefined;
    const getTarget = getReturnFocusTargetRef.current;

    let frame = 0;
    let attempt = 0;
    const restore = () => {
      if (!focusIsLost()) {
        return;
      }

      // The changed item's row can render a frame later than the dialog closes.
      const preferred = getTarget?.();
      if (isFocusable(preferred)) {
        preferred.focus();
        return;
      }

      if (preferred !== undefined && attempt < PREFERRED_TARGET_ATTEMPTS) {
        attempt += 1;
        frame = window.requestAnimationFrame(restore);
        return;
      }

      const fallback = document.querySelector<HTMLElement>(`[${DIALOG_FOCUS_FALLBACK_ATTRIBUTE}]`);
      const target = [opener, fallback].find(isFocusable);
      target?.focus();
    };

    const timeout = window.setTimeout(restore, 0);
    return () => {
      window.clearTimeout(timeout);
      window.cancelAnimationFrame(frame);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      onClose();
    };

    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [isOpen, onClose]);

  const onBackdropMouseDown: MouseEventHandler<HTMLDivElement> = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return { onBackdropMouseDown };
};
