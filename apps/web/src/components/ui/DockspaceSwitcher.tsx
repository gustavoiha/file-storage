import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type FocusEvent as ReactFocusEvent
} from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Film,
  FolderOpen,
  LayoutGrid,
  Plus,
  Search
} from 'lucide-react';
import { CreateDockspaceDialog } from '@/components/files/CreateDockspaceDialog';
import { focusIsLost, useDialogTabTrap } from '@/components/files/useDialogDismiss';
import { Button } from '@/components/ui/Button';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { computeVisibleTabIds } from '@/components/ui/dockspaceTabsLayout';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentDockspaceId } from '@/hooks/useCurrentDockspaceId';
import { useDockspaces } from '@/hooks/useDockspaces';
import { PHONE_LAYOUT_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import type { Dockspace, DockspaceType } from '@/lib/apiTypes';
import '@/styles/layout.css';

export type DockspaceSwitcherVariant = 'tabs' | 'bar';

/** Which switcher the app shows: tabs in the top nav (desktop), a bar under it (phone), or none. */
export const useDockspaceSwitcherVariant = (): DockspaceSwitcherVariant | null => {
  const { isAuthenticated } = useAuth();
  const currentDockspaceId = useCurrentDockspaceId();
  const isPhone = useMediaQuery(PHONE_LAYOUT_QUERY);

  if (!isAuthenticated || !currentDockspaceId) {
    return null;
  }

  return isPhone ? 'bar' : 'tabs';
};

export const formatDockspaceType = (dockspaceType: DockspaceType): string =>
  dockspaceType === 'PHOTOS_VIDEOS' ? 'Photos & Videos' : 'Generic Files';

const DockspaceTypeIcon = ({ dockspaceType, size }: { dockspaceType: DockspaceType; size: number }) =>
  dockspaceType === 'PHOTOS_VIDEOS' ? (
    <Film size={size} aria-hidden="true" className="dockspace-switcher__icon dockspace-switcher__icon--media" />
  ) : (
    <FolderOpen
      size={size}
      aria-hidden="true"
      className="dockspace-switcher__icon dockspace-switcher__icon--generic"
    />
  );

const matchesFilter = (dockspace: Dockspace, filter: string) =>
  dockspace.name.toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase());

const TAB_ID_ATTRIBUTE = 'data-dockspace-tab';

const findTab = (root: ParentNode | null | undefined, dockspaceId: string): HTMLElement | null => {
  for (const element of root?.querySelectorAll<HTMLElement>(`[${TAB_ID_ATTRIBUTE}]`) ?? []) {
    if (element.getAttribute(TAB_ID_ATTRIBUTE) === dockspaceId) {
      return element;
    }
  }

  return null;
};

/**
 * The dockspace list for the switcher. A failed load stays shown (with its Try again) through
 * every later refetch until the list loads: React Query clears `error` while a query without
 * data refetches, and the focused Try again button must not be swapped for a loading state.
 */
const useDockspaceListState = () => {
  const query = useDockspaces();
  const [lastError, setLastError] = useState<unknown>(null);
  const dockspaces = query.data;

  useEffect(() => {
    if (dockspaces) {
      setLastError(null);
    } else if (query.error) {
      setLastError(query.error);
    }
  }, [dockspaces, query.error]);

  const error = dockspaces ? null : (query.error ?? lastError);
  const { refetch, isFetching } = query;
  const retry = useCallback(() => {
    if (!isFetching) {
      void refetch();
    }
  }, [isFetching, refetch]);

  return {
    dockspaces,
    hasError: !dockspaces && Boolean(error),
    isLoading: !dockspaces && !error,
    isRetrying: isFetching,
    retry
  };
};

/**
 * When the list loads after a Try again, the error block (and its focused button) goes away.
 * Focus then moves to the switcher's stable control instead of falling to <body>.
 */
const useRetryFocusReturn = (hasError: boolean, getFallback: () => HTMLElement | null | undefined) => {
  const retryHadFocusRef = useRef(false);
  const hadErrorRef = useRef(hasError);
  const getFallbackRef = useRef(getFallback);
  getFallbackRef.current = getFallback;

  useEffect(() => {
    const hadError = hadErrorRef.current;
    hadErrorRef.current = hasError;
    if (!hadError || hasError || !retryHadFocusRef.current) {
      return;
    }

    retryHadFocusRef.current = false;
    if (focusIsLost()) {
      getFallbackRef.current()?.focus();
    }
  }, [hasError]);

  return {
    onFocus: () => {
      retryHadFocusRef.current = true;
    },
    onBlur: () => {
      retryHadFocusRef.current = false;
    }
  };
};

interface SwitcherErrorProps {
  variant: DockspaceSwitcherVariant;
  isRetrying: boolean;
  onRetry: () => void;
  focusHandlers: { onFocus: () => void; onBlur: () => void };
}

const SwitcherError = ({ variant, isRetrying, onRetry, focusHandlers }: SwitcherErrorProps) => (
  <p role="alert" className={`dockspace-switcher-error dockspace-switcher-error--${variant}`}>
    <CircleAlert size={16} aria-hidden="true" className="dockspace-switcher-error__icon" />
    <span className="dockspace-switcher-error__message">Couldn&apos;t load dockspaces.</span>
    <button
      type="button"
      className={
        variant === 'bar'
          ? 'ui-button ui-button--secondary ui-button--sm dockspace-switcher-error__retry'
          : 'dockspace-switcher-error__retry dockspace-switcher-error__retry--text'
      }
      aria-disabled={isRetrying || undefined}
      aria-busy={isRetrying || undefined}
      onClick={() => {
        if (!isRetrying) {
          onRetry();
        }
      }}
      {...focusHandlers}
    >
      Try again
    </button>
  </p>
);

interface NewDockspaceMenuProps {
  className: string;
  /** Called after the dockspace was created (and the list refreshed), before the dialog closes. */
  onCreated: (dockspace: Dockspace) => Promise<void> | void;
  /** Where focus goes once the dialog closed after creating that dockspace. */
  getCreatedFocusTarget: (dockspaceId: string) => HTMLElement | null;
  /** True while the menu or the create dialog is open (they handle Escape themselves). */
  onActiveChange?: ((isActive: boolean) => void) | undefined;
}

const NewDockspaceMenu = ({ className, onCreated, getCreatedFocusTarget, onActiveChange }: NewDockspaceMenuProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [createType, setCreateType] = useState<DockspaceType | null>(null);
  const createdIdRef = useRef<string | null>(null);
  const isActive = isMenuOpen || createType !== null;

  useEffect(() => {
    onActiveChange?.(isActive);
  }, [isActive, onActiveChange]);

  const openCreateDialog = (dockspaceType: DockspaceType) => {
    createdIdRef.current = null;
    setCreateType(dockspaceType);
  };

  return (
    <>
      <DropdownMenu className={className} isOpen={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenu.Trigger className="dockspace-switcher__icon-button" aria-label="New dockspace">
          <Plus size={16} aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content className="dockspace-switcher__create-menu" label="New dockspace">
          <div className="dockspace-switcher__create-menu-label" aria-hidden="true">
            New dockspace
          </div>
          <DropdownMenu.Button
            className="dockspace-switcher__create-menu-item"
            onClick={() => openCreateDialog('GENERIC_FILES')}
          >
            <FolderOpen size={16} aria-hidden="true" />
            Generic Files
          </DropdownMenu.Button>
          <DropdownMenu.Button
            className="dockspace-switcher__create-menu-item"
            onClick={() => openCreateDialog('PHOTOS_VIDEOS')}
          >
            <Film size={16} aria-hidden="true" />
            Photos &amp; Videos
          </DropdownMenu.Button>
        </DropdownMenu.Content>
      </DropdownMenu>
      {createPortal(
        <CreateDockspaceDialog
          dockspaceType={createType}
          backdropClassName="dockspace-dialog-backdrop--switcher"
          onClose={() => setCreateType(null)}
          onCreated={async (dockspace) => {
            createdIdRef.current = dockspace.dockspaceId;
            await onCreated(dockspace);
          }}
          getReturnFocusTarget={() =>
            createdIdRef.current ? getCreatedFocusTarget(createdIdRef.current) : undefined
          }
        />,
        document.body
      )}
    </>
  );
};

/* ------------------------------------------------------------------------------------------
 * Desktop: tabs in the top nav, with "More (n)" for the tabs that do not fit.
 * ---------------------------------------------------------------------------------------- */

interface MoreDockspacesProps {
  dockspaces: Dockspace[];
  /** Called when a dockspace row was chosen (null for "All dockspaces"). */
  onChoose: (dockspaceId: string | null) => void;
}

const MoreDockspaces = ({ dockspaces, onChoose }: MoreDockspacesProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverId = useId();
  const filterId = useId();
  const filtered = useMemo(
    () => dockspaces.filter((dockspace) => matchesFilter(dockspace, filter)),
    [dockspaces, filter]
  );

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onDocumentPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', onDocumentPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
    };
  }, [isOpen]);

  const close = (returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) {
      buttonRef.current?.focus();
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }

    const popover = document.getElementById(popoverId);
    if (!popover) {
      return;
    }

    const items = [
      ...(inputRef.current ? [inputRef.current] : []),
      ...Array.from(popover.querySelectorAll<HTMLElement>('a[href]'))
    ];
    if (items.length === 0) {
      return;
    }

    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex =
      event.key === 'ArrowDown'
        ? (index + 1) % items.length
        : index <= 0
          ? items.length - 1
          : index - 1;
    items[nextIndex]?.focus();
  };

  // Tab past the last item closes it; focus stays where it went.
  const onBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (isOpen && next && !rootRef.current?.contains(next)) {
      setIsOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="dockspace-tabs__more" onKeyDown={onKeyDown} onBlur={onBlur}>
      <Button
        ref={buttonRef}
        variant="secondary"
        size="sm"
        className="dockspace-tabs__more-button"
        aria-expanded={isOpen}
        aria-controls={popoverId}
        onClick={() => {
          if (!isOpen) {
            setFilter('');
          }
          setIsOpen(!isOpen);
        }}
      >
        More ({dockspaces.length})
        <ChevronDown size={14} aria-hidden="true" />
      </Button>
      <div id={popoverId} className="dockspace-tabs__popover" hidden={!isOpen}>
        <label className="dockspace-switcher__filter" htmlFor={filterId}>
          <Search size={14} aria-hidden="true" />
          <span className="visually-hidden">Filter dockspaces</span>
          <input
            ref={inputRef}
            id={filterId}
            type="search"
            className="dockspace-switcher__filter-input"
            placeholder="Filter dockspaces"
            autoComplete="off"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
        {filtered.length ? (
          <ul className="dockspace-tabs__popover-list">
            {filtered.map((dockspace) => (
              <li key={dockspace.dockspaceId}>
                <Link
                  to="/dockspaces/$dockspaceId"
                  params={{ dockspaceId: dockspace.dockspaceId }}
                  className="dockspace-tabs__popover-row"
                  aria-label={`${dockspace.name}, ${formatDockspaceType(dockspace.dockspaceType)}`}
                  onClick={() => {
                    setIsOpen(false);
                    onChoose(dockspace.dockspaceId);
                  }}
                >
                  <DockspaceTypeIcon dockspaceType={dockspace.dockspaceType} size={15} />
                  <span className="dockspace-tabs__popover-name">{dockspace.name}</span>
                  <span className="dockspace-tabs__popover-type">
                    {formatDockspaceType(dockspace.dockspaceType)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="dockspace-switcher__empty">No dockspaces match</p>
        )}
        <div className="dockspace-tabs__popover-separator" role="separator" />
        <Link
          to="/dockspaces"
          activeOptions={{ exact: true }}
          className="dockspace-tabs__popover-row dockspace-tabs__popover-row--all"
          onClick={() => {
            setIsOpen(false);
            onChoose(null);
          }}
        >
          <LayoutGrid size={15} aria-hidden="true" />
          <span className="dockspace-tabs__popover-name">All dockspaces</span>
        </Link>
      </div>
    </div>
  );
};

const tabClassName = (dockspace: Dockspace, isCurrent: boolean) =>
  [
    'dockspace-tab',
    dockspace.dockspaceType === 'PHOTOS_VIDEOS' ? 'dockspace-tab--media' : 'dockspace-tab--generic',
    isCurrent ? 'dockspace-tab--current' : ''
  ]
    .filter(Boolean)
    .join(' ');

const sameIds = (left: readonly string[] | null, right: readonly string[]) =>
  left !== null && left.length === right.length && left.every((id, index) => id === right[index]);

const widthOf = (element: Element | null | undefined) =>
  element ? element.getBoundingClientRect().width : 0;

const columnGapOf = (element: Element | null | undefined) =>
  element ? Number.parseFloat(window.getComputedStyle(element).columnGap) || 0 : 0;

export const DockspaceTabs = ({ currentDockspaceId }: { currentDockspaceId: string }) => {
  const navigate = useNavigate();
  const { dockspaces, hasError, isLoading, isRetrying, retry } = useDockspaceListState();
  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleIds, setVisibleIds] = useState<string[] | null>(null);
  // A dockspace chosen in More: its tab takes focus once it is the current, visible tab.
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  const recompute = useCallback(() => {
    const nav = navRef.current;
    const measure = measureRef.current;
    if (!nav || !measure || !dockspaces) {
      setVisibleIds((previous) => (previous === null ? previous : null));
      return;
    }

    const widths: Record<string, number> = {};
    for (const element of measure.querySelectorAll<HTMLElement>('[data-measure-id]')) {
      widths[element.getAttribute('data-measure-id') ?? ''] = widthOf(element);
    }

    const navGap = columnGapOf(nav);
    const createWidth = widthOf(nav.querySelector('.dockspace-tabs__create'));
    const next = computeVisibleTabIds({
      ids: dockspaces.map((dockspace) => dockspace.dockspaceId),
      widths,
      currentId: currentDockspaceId,
      available: widthOf(nav) - (createWidth ? createWidth + navGap : 0),
      gap: columnGapOf(measure),
      moreWidth: widthOf(measure.querySelector('[data-measure-more]')) + navGap
    });
    setVisibleIds((previous) => (sameIds(previous, next) ? previous : next));
  }, [currentDockspaceId, dockspaces]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => recompute());
    if (navRef.current) {
      observer.observe(navRef.current);
    }
    if (measureRef.current) {
      observer.observe(measureRef.current);
    }

    return () => observer.disconnect();
  }, [recompute]);

  useEffect(() => {
    if (pendingFocusId === null || pendingFocusId !== currentDockspaceId) {
      return;
    }

    const tab = findTab(navRef.current, pendingFocusId);
    if (!tab) {
      return;
    }

    setPendingFocusId(null);
    if (focusIsLost()) {
      tab.focus();
    }
  }, [currentDockspaceId, pendingFocusId, visibleIds]);

  const retryFocus = useRetryFocusReturn(hasError, () =>
    navRef.current?.querySelector<HTMLElement>('.dockspace-tabs__create .dropdown-menu__trigger')
  );

  const visibleSet = useMemo(
    () => (visibleIds === null ? null : new Set(visibleIds)),
    [visibleIds]
  );
  const shown = dockspaces?.filter((dockspace) => !visibleSet || visibleSet.has(dockspace.dockspaceId)) ?? [];
  const hidden = dockspaces?.filter((dockspace) => visibleSet && !visibleSet.has(dockspace.dockspaceId)) ?? [];

  return (
    <nav ref={navRef} className="dockspace-tabs" aria-label="Dockspaces">
      {isLoading ? (
        <div role="status" className="dockspace-tabs__loading">
          <span className="visually-hidden">Loading dockspaces</span>
          <span className="dockspace-switcher__skeleton" style={{ width: 120 }} aria-hidden="true" />
          <span className="dockspace-switcher__skeleton" style={{ width: 100 }} aria-hidden="true" />
          <span className="dockspace-switcher__skeleton" style={{ width: 110 }} aria-hidden="true" />
        </div>
      ) : hasError ? (
        <SwitcherError variant="tabs" isRetrying={isRetrying} onRetry={retry} focusHandlers={retryFocus} />
      ) : (
        <ul className="dockspace-tabs__list">
          {shown.map((dockspace) => {
            const isCurrent = dockspace.dockspaceId === currentDockspaceId;
            const typeLabel = formatDockspaceType(dockspace.dockspaceType);
            return (
              <li key={dockspace.dockspaceId} className="dockspace-tabs__item">
                <Link
                  to="/dockspaces/$dockspaceId"
                  params={{ dockspaceId: dockspace.dockspaceId }}
                  className={tabClassName(dockspace, isCurrent)}
                  aria-current={isCurrent ? 'page' : undefined}
                  aria-label={`${dockspace.name}, ${typeLabel}`}
                  {...{ [TAB_ID_ATTRIBUTE]: dockspace.dockspaceId }}
                >
                  <DockspaceTypeIcon dockspaceType={dockspace.dockspaceType} size={15} />
                  <span className="dockspace-tab__name">{dockspace.name}</span>
                  <span className="dockspace-tab__tip" aria-hidden="true">
                    <strong>{dockspace.name}</strong>
                    <span>{typeLabel}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {hidden.length ? (
        <MoreDockspaces dockspaces={hidden} onChoose={(dockspaceId) => setPendingFocusId(dockspaceId)} />
      ) : null}
      {isLoading ? null : (
        <NewDockspaceMenu
          className="dockspace-tabs__create"
          onCreated={async (dockspace) => {
            await navigate({ to: '/dockspaces/$dockspaceId', params: { dockspaceId: dockspace.dockspaceId } });
          }}
          getCreatedFocusTarget={(dockspaceId) => findTab(navRef.current, dockspaceId)}
        />
      )}
      {dockspaces?.length ? (
        // Off-screen copies of every tab and of More, measured to decide how many tabs fit.
        <div className="dockspace-tabs__measure" aria-hidden="true">
          <div ref={measureRef} className="dockspace-tabs__measure-row">
            {dockspaces.map((dockspace) => (
              <span
                key={dockspace.dockspaceId}
                data-measure-id={dockspace.dockspaceId}
                className={tabClassName(dockspace, dockspace.dockspaceId === currentDockspaceId)}
              >
                <DockspaceTypeIcon dockspaceType={dockspace.dockspaceType} size={15} />
                <span className="dockspace-tab__name">{dockspace.name}</span>
              </span>
            ))}
            <span
              data-measure-more=""
              className="ui-button ui-button--secondary ui-button--sm dockspace-tabs__more-button"
            >
              More ({dockspaces.length})
              <ChevronDown size={14} aria-hidden="true" />
            </span>
          </div>
        </div>
      ) : null}
    </nav>
  );
};

/* ------------------------------------------------------------------------------------------
 * Phone: a bar under the top nav that opens a full-screen list.
 * ---------------------------------------------------------------------------------------- */

interface DockspaceSwitcherScreenProps {
  dockspaces: Dockspace[];
  currentDockspaceId: string;
  /** Close the list; returnFocus moves focus back to the bar button. */
  onClose: (returnFocus: boolean) => void;
  getBarButton: () => HTMLElement | null;
}

const DockspaceSwitcherScreen = ({
  dockspaces,
  currentDockspaceId,
  onClose,
  getBarButton
}: DockspaceSwitcherScreenProps) => {
  const navigate = useNavigate();
  const titleId = useId();
  const filterId = useId();
  const [filter, setFilter] = useState('');
  const [isCreateActive, setIsCreateActive] = useState(false);
  const isCreateActiveRef = useRef(false);
  isCreateActiveRef.current = isCreateActive;
  // The create dialog has its own Tab trap.
  const screenRef = useDialogTabTrap<HTMLDivElement>(!isCreateActive);
  const listRef = useRef<HTMLElement>(null);
  const filtered = useMemo(
    () => dockspaces.filter((dockspace) => matchesFilter(dockspace, filter)),
    [dockspaces, filter]
  );

  // Opening focuses the current dockspace (not the filter, which would pop the keyboard).
  useLayoutEffect(() => {
    const list = listRef.current;
    const target =
      list?.querySelector<HTMLElement>('[aria-current="page"]') ?? list?.querySelector<HTMLElement>('a[href]');
    target?.focus({ preventScroll: true });
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' });
    }
  }, []);

  // The page behind does not scroll while the list is open.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      // The + menu and the create dialog close themselves on Escape.
      if (event.key !== 'Escape' || isCreateActiveRef.current) {
        return;
      }

      event.preventDefault();
      onClose(true);
    };

    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={screenRef}
      className="dockspace-switcher-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="dockspace-switcher-screen__header">
        <button
          type="button"
          className="dockspace-switcher__icon-button dockspace-switcher__icon-button--ghost"
          aria-label="Close dockspaces"
          onClick={() => onClose(true)}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <h2 id={titleId} className="dockspace-switcher-screen__title">
          Dockspaces
        </h2>
        <NewDockspaceMenu
          className="dockspace-switcher-screen__create"
          onActiveChange={setIsCreateActive}
          onCreated={async (dockspace) => {
            await navigate({ to: '/dockspaces/$dockspaceId', params: { dockspaceId: dockspace.dockspaceId } });
            onClose(true);
          }}
          getCreatedFocusTarget={() => getBarButton()}
        />
      </div>
      <label className="dockspace-switcher__filter dockspace-switcher-screen__filter" htmlFor={filterId}>
        <Search size={15} aria-hidden="true" />
        <span className="visually-hidden">Filter dockspaces</span>
        <input
          id={filterId}
          type="search"
          className="dockspace-switcher__filter-input"
          placeholder="Filter dockspaces"
          autoComplete="off"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </label>
      <nav ref={listRef} className="dockspace-switcher-screen__list" aria-label="Dockspaces">
        {filtered.length ? (
          <ul>
            {filtered.map((dockspace) => {
              const isCurrent = dockspace.dockspaceId === currentDockspaceId;
              return (
                <li key={dockspace.dockspaceId}>
                  <Link
                    to="/dockspaces/$dockspaceId"
                    params={{ dockspaceId: dockspace.dockspaceId }}
                    className={`dockspace-switcher-screen__row${
                      dockspace.dockspaceType === 'PHOTOS_VIDEOS'
                        ? ' dockspace-switcher-screen__row--media'
                        : ' dockspace-switcher-screen__row--generic'
                    }`}
                    aria-current={isCurrent ? 'page' : undefined}
                    aria-label={`${dockspace.name}, ${formatDockspaceType(dockspace.dockspaceType)}`}
                    onClick={() => onClose(true)}
                  >
                    <DockspaceTypeIcon dockspaceType={dockspace.dockspaceType} size={20} />
                    <span className="dockspace-switcher-screen__row-text">
                      <span className="dockspace-switcher-screen__row-name">{dockspace.name}</span>
                      <span className="dockspace-switcher-screen__row-type">
                        {formatDockspaceType(dockspace.dockspaceType)}
                        {isCurrent ? ' · Current' : ''}
                      </span>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" className="dockspace-switcher-screen__row-chevron" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="dockspace-switcher__empty">No dockspaces match</p>
        )}
        <Link
          to="/dockspaces"
          activeOptions={{ exact: true }}
          className="dockspace-switcher-screen__all"
          onClick={() => onClose(false)}
        >
          <LayoutGrid size={15} aria-hidden="true" />
          All dockspaces
        </Link>
      </nav>
    </div>,
    document.body
  );
};

export const DockspaceSwitcherBar = ({ currentDockspaceId }: { currentDockspaceId: string }) => {
  const { dockspaces, hasError, isLoading, isRetrying, retry } = useDockspaceListState();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef(false);
  const current = dockspaces?.find((dockspace) => dockspace.dockspaceId === currentDockspaceId);

  const close = useCallback((returnFocus: boolean) => {
    returnFocusRef.current = returnFocus;
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (isOpen || !returnFocusRef.current) {
      return;
    }

    returnFocusRef.current = false;
    buttonRef.current?.focus();
  }, [isOpen]);

  // The list cannot stay open without a list to show.
  useEffect(() => {
    if (!dockspaces && isOpen) {
      setIsOpen(false);
    }
  }, [dockspaces, isOpen]);

  const retryFocus = useRetryFocusReturn(hasError, () => buttonRef.current);
  const count = dockspaces?.length ?? 0;

  return (
    <div className="dockspace-switcher-bar">
      {isLoading ? (
        <div role="status" className="dockspace-switcher-bar__loading">
          <span className="visually-hidden">Loading dockspaces</span>
          <span className="dockspace-switcher__skeleton dockspace-switcher-bar__skeleton" aria-hidden="true" />
        </div>
      ) : hasError || !dockspaces ? (
        <SwitcherError variant="bar" isRetrying={isRetrying} onRetry={retry} focusHandlers={retryFocus} />
      ) : (
        <button
          ref={buttonRef}
          type="button"
          className="dockspace-switcher-bar__button"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label={
            current
              ? `Switch dockspace, current: ${current.name}, ${formatDockspaceType(current.dockspaceType)}`
              : 'Switch dockspace'
          }
          onClick={() => setIsOpen(true)}
        >
          {current ? <DockspaceTypeIcon dockspaceType={current.dockspaceType} size={16} /> : null}
          <span className="dockspace-switcher-bar__name">{current?.name ?? 'Dockspaces'}</span>
          <span className="dockspace-switcher-bar__count">
            {count} {count === 1 ? 'dockspace' : 'dockspaces'}
          </span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      )}
      {isOpen && dockspaces ? (
        <DockspaceSwitcherScreen
          dockspaces={dockspaces}
          currentDockspaceId={currentDockspaceId}
          onClose={close}
          getBarButton={() => buttonRef.current}
        />
      ) : null}
    </div>
  );
};
