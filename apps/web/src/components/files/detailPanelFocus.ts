import {
  DIALOG_FOCUS_FALLBACK_ATTRIBUTE,
  ROW_PATH_ATTRIBUTE,
  findRowByPath,
  isFocusable,
  resolveOpener
} from './useDialogDismiss';

/** Class of the "Dockspace options" / "Folder options" menu trigger. */
const PAGE_MENU_TRIGGER_SELECTOR = '.dockspace-page-menu .dropdown-menu__trigger';
const ROW_MENU_TRIGGER_SELECTOR = '.dropdown-menu__trigger';

/**
 * Where a detail panel (folder info) was opened from. The element itself is kept for the desktop
 * layout, where it stays on the page. On phone the panel replaces the listing, so the opener is
 * unmounted and found again by what it was: a row, a row's menu trigger, or the options menu trigger.
 */
export interface DetailPanelOpener {
  element: HTMLElement | null;
  kind: 'row' | 'row-trigger' | 'options' | 'other';
  rowPath: string | null;
}

/** Call while the menu item that opens the panel still holds focus. */
export const captureDetailPanelOpener = (): DetailPanelOpener => {
  const element = resolveOpener(document.activeElement);
  if (!element) {
    return { element: null, kind: 'other', rowPath: null };
  }

  const ownRowPath = element.getAttribute(ROW_PATH_ATTRIBUTE);
  if (ownRowPath !== null) {
    return { element, kind: 'row', rowPath: ownRowPath };
  }

  if (element.matches(PAGE_MENU_TRIGGER_SELECTOR)) {
    return { element, kind: 'options', rowPath: null };
  }

  const rowPath =
    element
      .closest('li')
      ?.querySelector<HTMLElement>(`[${ROW_PATH_ATTRIBUTE}]`)
      ?.getAttribute(ROW_PATH_ATTRIBUTE) ?? null;
  if (rowPath !== null && element.matches(ROW_MENU_TRIGGER_SELECTOR)) {
    return { element, kind: 'row-trigger', rowPath };
  }

  return { element, kind: 'other', rowPath: null };
};

/** The element to focus when the panel closes: the opener, or its re-rendered counterpart, or the list. */
export const resolveDetailPanelReturnTarget = (opener: DetailPanelOpener | null): HTMLElement | null => {
  if (opener && isFocusable(opener.element)) {
    return opener.element;
  }

  let target: HTMLElement | null = null;
  if (opener?.kind === 'options') {
    target = document.querySelector<HTMLElement>(PAGE_MENU_TRIGGER_SELECTOR);
  } else if (opener?.rowPath) {
    const row = findRowByPath(opener.rowPath);
    const rowTrigger =
      opener.kind === 'row-trigger'
        ? (row?.closest('li')?.querySelector<HTMLElement>(ROW_MENU_TRIGGER_SELECTOR) ?? null)
        : null;
    target = isFocusable(rowTrigger) ? rowTrigger : row;
  }

  if (isFocusable(target)) {
    return target;
  }

  const fallback = document.querySelector<HTMLElement>(`[${DIALOG_FOCUS_FALLBACK_ATTRIBUTE}]`);
  return isFocusable(fallback) ? fallback : null;
};
