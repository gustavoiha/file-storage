import {
  DIALOG_FOCUS_FALLBACK_ATTRIBUTE,
  ROW_PATH_ATTRIBUTE,
  findRowByPath,
  focusIsLost,
  isFocusable,
  resolveOpener
} from './useDialogDismiss';

/** Frames to wait for the list to drop the removed row after the request resolves. */
const ROW_REMOVAL_ATTEMPTS = 10;

export interface RowRemovalFocus {
  /** The row was removed: focus the next row, else the previous one, else the file list. */
  onRemoved: () => void;
  /** The row stays: return focus to the row's menu trigger, or to the row. */
  onFailed: () => void;
}

/**
 * Call when a row menu action that removes the row without a dialog starts (Move to Trash on a
 * file), while the menu item still holds focus. The menu item is removed as the menu closes, so
 * focus goes back to the row's menu trigger (or the row) while the request runs, and the rows
 * around it are recorded so focus can move to a neighbour once the row is gone. Focus is only
 * moved when it was lost (on body), never away from where the user moved it meanwhile.
 */
export const startRowRemovalFocus = (fullPath: string): RowRemovalFocus => {
  const opener = resolveOpener(document.activeElement);
  const list =
    findRowByPath(fullPath)?.closest<HTMLElement>(`[${DIALOG_FOCUS_FALLBACK_ATTRIBUTE}]`) ?? null;
  const rowPaths = list
    ? Array.from(
        list.querySelectorAll<HTMLElement>(`[${ROW_PATH_ATTRIBUTE}]`),
        (element) => element.getAttribute(ROW_PATH_ATTRIBUTE) ?? ''
      )
    : [];
  const index = rowPaths.indexOf(fullPath);
  // Next rows first (nearest first), then previous rows (nearest first).
  const neighbourPaths =
    index === -1 ? [] : rowPaths.slice(index + 1).concat(rowPaths.slice(0, index).reverse());

  const focusRow = () => {
    if (focusIsLost()) {
      [opener, findRowByPath(fullPath)].find(isFocusable)?.focus();
    }
  };

  window.setTimeout(focusRow, 0);

  return {
    onFailed: () => {
      window.setTimeout(focusRow, 0);
    },
    onRemoved: () => {
      let attempt = 0;
      const restore = () => {
        // The list can re-render a frame or more after the request resolves.
        const row = findRowByPath(fullPath);
        if (row && attempt < ROW_REMOVAL_ATTEMPTS) {
          attempt += 1;
          window.requestAnimationFrame(restore);
          return;
        }

        if (!focusIsLost()) {
          return;
        }

        const fallback = document.querySelector<HTMLElement>(`[${DIALOG_FOCUS_FALLBACK_ATTRIBUTE}]`);
        const target = row ?? [...neighbourPaths.map(findRowByPath), list, fallback].find(isFocusable);
        target?.focus();
      };

      window.setTimeout(restore, 0);
    }
  };
};
