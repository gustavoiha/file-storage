export interface DockspaceTabsLayoutInput {
  /** Dockspace ids in list order. */
  ids: readonly string[];
  /** Measured width of each tab, by id. */
  widths: Readonly<Record<string, number>>;
  /** The current dockspace: always visible, even when it does not fit. */
  currentId: string | null;
  /** Width available to the tabs and the More button together. */
  available: number;
  /** Gap between two tabs. */
  gap: number;
  /** Width the More button takes, including its gap to the tabs. */
  moreWidth: number;
}

/**
 * The ids of the tabs shown in the strip, in list order. All of them when they fit; otherwise as
 * many as fit next to the More button, in list order, with the current dockspace always kept: if
 * it would be hidden, it takes the place of the last tab that would have been shown.
 */
export const computeVisibleTabIds = ({
  ids,
  widths,
  currentId,
  available,
  gap,
  moreWidth
}: DockspaceTabsLayoutInput): string[] => {
  const widthOf = (id: string) => widths[id] ?? 0;
  const total = ids.reduce((sum, id) => sum + widthOf(id), 0) + gap * Math.max(ids.length - 1, 0);
  if (total <= available) {
    return [...ids];
  }

  const budget = available - moreWidth;
  const current = currentId !== null && ids.includes(currentId) ? currentId : null;
  const visible = new Set<string>();
  let used = 0;
  if (current !== null) {
    visible.add(current);
    used = widthOf(current);
  }

  for (const id of ids) {
    if (id === current) {
      continue;
    }

    const next = used + (visible.size > 0 ? gap : 0) + widthOf(id);
    if (next > budget) {
      break;
    }

    visible.add(id);
    used = next;
  }

  return ids.filter((id) => visible.has(id));
};
