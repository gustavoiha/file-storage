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

interface OpenerRecord {
  element: HTMLElement | null;
  /** Path of the row the opener belongs to, when it is a row or a row's menu trigger. */
  rowPath: string | null;
  isMenuTrigger: boolean;
}

const MENU_TRIGGER_CLASS = 'dropdown-menu__trigger';

const recordOpener = (element: HTMLElement | null): OpenerRecord => {
  const rowPath = element?.getAttribute(ROW_PATH_ATTRIBUTE) ?? null;
  if (!element || rowPath !== null) {
    return { element, rowPath, isMenuTrigger: false };
  }

  if (element.classList.contains(MENU_TRIGGER_CLASS)) {
    const row = element.closest('li')?.querySelector<HTMLElement>(`[${ROW_PATH_ATTRIBUTE}]`) ?? null;
    return { element, rowPath: row?.getAttribute(ROW_PATH_ATTRIBUTE) ?? null, isMenuTrigger: true };
  }

  return { element, rowPath: null, isMenuTrigger: false };
};

/**
 * The opener, or its replacement when its row was re-rendered as a new element while the
 * dialog was open (e.g. a folder shown as a pending "Trashing..." row during a failed submit):
 * the same row's menu trigger, or the row itself.
 */
const findOpener = ({ element, rowPath, isMenuTrigger }: OpenerRecord): HTMLElement | null => {
  if (isFocusable(element) || rowPath === null) {
    return element;
  }

  const row = findRowByPath(rowPath);
  if (!isMenuTrigger) {
    return row;
  }

  const trigger = row?.closest('li')?.querySelector<HTMLElement>(`.${MENU_TRIGGER_CLASS}`) ?? null;
  return isFocusable(trigger) ? trigger : row;
};

const TABBABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  // Media with native controls and embedded frames (the file preview's video, audio and PDF) take Tab too.
  'audio[controls]',
  'video[controls]',
  'iframe',
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

interface UseFocusAfterFailedSubmitOptions {
  isOpen: boolean;
  isSubmitting: boolean;
  errorMessage: string | null;
}

/**
 * The focused submit button is disabled while a dialog submits, so focus falls to body. When the
 * submit fails and the dialog stays open with its error, focus moves to the returned ref's element
 * (Cancel). Success closes the dialog, and its focus is left to the dialog's close handling.
 */
export const useFocusAfterFailedSubmit = <T extends HTMLElement>({
  isOpen,
  isSubmitting,
  errorMessage
}: UseFocusAfterFailedSubmitOptions) => {
  const targetRef = useRef<T>(null);
  const wasSubmittingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      wasSubmittingRef.current = false;
      return;
    }

    if (isSubmitting) {
      wasSubmittingRef.current = true;
      return;
    }

    // The error and the end of the submit can arrive in separate renders, in either order.
    if (!wasSubmittingRef.current || !errorMessage) {
      return;
    }

    wasSubmittingRef.current = false;
    if (focusIsLost() && isFocusable(targetRef.current)) {
      targetRef.current.focus();
    }
  }, [isOpen, isSubmitting, errorMessage]);

  return targetRef;
};

export const useDialogDismiss = ({ isOpen, onClose, getReturnFocusTarget }: UseDialogDismissOptions) => {
  const openerRef = useRef<OpenerRecord | undefined>(undefined);
  const wasOpenRef = useRef(isOpen);
  const getReturnFocusTargetRef = useRef(getReturnFocusTarget);
  getReturnFocusTargetRef.current = getReturnFocusTarget;

  // Read the opener while rendering the opening update: by the time effects run,
  // the dialog's autofocused field already holds focus.
  if (isOpen && openerRef.current === undefined) {
    openerRef.current = recordOpener(resolveOpener(document.activeElement));
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
    const openerRecord = openerRef.current;
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
      const opener = openerRecord ? findOpener(openerRecord) : null;
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
