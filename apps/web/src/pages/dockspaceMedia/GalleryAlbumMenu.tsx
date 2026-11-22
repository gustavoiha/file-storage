import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Images } from 'lucide-react';
import { useDialogTabTrap } from '@/components/files/useDialogDismiss';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import type { AlbumRecord } from '@/lib/apiTypes';
import { pluralize } from '@/lib/fileFormat';

/** Class of the album menu button, so the workspace can move focus to it (e.g. after leaving selection mode). */
export const GALLERY_ALBUM_TRIGGER_CLASS = 'gallery-album-menu__trigger';

interface GalleryAlbumMenuProps {
  albums: AlbumRecord[];
  selectedAlbumId: string | null;
  /** Phone: the button opens a full-screen album list instead of a dropdown. */
  isPhone: boolean;
  onSelectAllMedia: () => void;
  onSelectAlbumById: (albumId: string) => void;
}

const countLabel = (count: number | undefined): string | null =>
  typeof count === 'number' ? pluralize(count, 'item') : null;

/** "Travel, 3 items" for an album with a count, else just the name. */
const albumAccessibleName = (name: string, count: number | undefined): string => {
  const label = countLabel(count);
  return label ? `${name}, ${label}` : name;
};

const TriggerContents = ({ name, count }: { name: string; count: number | undefined }) => (
  <>
    <Images size={16} aria-hidden="true" className="gallery-album-menu__icon" />
    <span className="gallery-album-menu__name">{name}</span>
    {typeof count === 'number' ? <span className="gallery-album-menu__count">{count}</span> : null}
    <ChevronDown size={14} aria-hidden="true" className="gallery-album-menu__chevron" />
  </>
);

/** Phone: full-screen album list, built like the phone dockspace list. */
const GalleryAlbumScreen = ({
  albums,
  selectedAlbumId,
  onChoose,
  onClose
}: {
  albums: AlbumRecord[];
  selectedAlbumId: string | null;
  /** null chooses All media. */
  onChoose: (albumId: string | null) => void;
  onClose: () => void;
}) => {
  const titleId = useId();
  const screenRef = useDialogTabTrap<HTMLDivElement>(true);
  const listRef = useRef<HTMLElement>(null);

  // Opening focuses the current row.
  useLayoutEffect(() => {
    const list = listRef.current;
    const target =
      list?.querySelector<HTMLElement>('[aria-current="true"]') ?? list?.querySelector<HTMLElement>('button');
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
  }, [onClose]);

  const rows: Array<{ albumId: string | null; name: string; count: number | undefined }> = [
    { albumId: null, name: 'All media', count: undefined },
    ...albums.map((album) => ({ albumId: album.albumId, name: album.name, count: album.mediaCount }))
  ];

  return createPortal(
    <div
      ref={screenRef}
      className="dockspace-switcher-screen gallery-album-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="dockspace-switcher-screen__header">
        <button
          type="button"
          className="dockspace-switcher__icon-button dockspace-switcher__icon-button--ghost"
          aria-label="Close albums"
          onClick={onClose}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <h2 id={titleId} className="dockspace-switcher-screen__title">
          Albums
        </h2>
      </div>
      <nav ref={listRef} className="dockspace-switcher-screen__list" aria-label="Albums">
        <ul>
          {rows.map((row) => {
            const isCurrent = row.albumId === selectedAlbumId;
            return (
              <li key={row.albumId ?? 'all-media'}>
                <button
                  type="button"
                  className="dockspace-switcher-screen__row gallery-album-screen__row"
                  aria-current={isCurrent ? 'true' : undefined}
                  aria-label={albumAccessibleName(row.name, row.count)}
                  onClick={() => onChoose(row.albumId)}
                >
                  <Images size={18} aria-hidden="true" className="gallery-album-screen__icon" />
                  <span className="dockspace-switcher-screen__row-name gallery-album-screen__name">{row.name}</span>
                  {typeof row.count === 'number' ? (
                    <span className="gallery-album-screen__count">{row.count}</span>
                  ) : null}
                  <ChevronRight size={16} aria-hidden="true" className="dockspace-switcher-screen__row-chevron" />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>,
    document.body
  );
};

/** The current album as a menu button: a dropdown of albums on desktop, a full-screen list on phone. */
export const GalleryAlbumMenu = ({
  albums,
  selectedAlbumId,
  isPhone,
  onSelectAllMedia,
  onSelectAlbumById
}: GalleryAlbumMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const phoneTriggerRef = useRef<HTMLButtonElement>(null);
  const selectedAlbum = selectedAlbumId
    ? (albums.find((album) => album.albumId === selectedAlbumId) ?? null)
    : null;
  const name = selectedAlbum?.name ?? 'All media';
  const count = selectedAlbum?.mediaCount;
  const triggerLabel = `Album: ${albumAccessibleName(name, count)}`;

  // The menu or list cannot stay open across a switch between the phone and desktop layouts.
  useEffect(() => {
    setIsOpen(false);
  }, [isPhone]);

  const focusTrigger = useCallback(() => {
    rootRef.current?.querySelector<HTMLElement>(`.${GALLERY_ALBUM_TRIGGER_CLASS}`)?.focus();
  }, []);

  const choose = useCallback(
    (albumId: string | null) => {
      // Focus moves to the trigger before the chosen item (or the whole list) goes away.
      focusTrigger();
      setIsOpen(false);
      if (albumId === null) {
        onSelectAllMedia();
      } else {
        onSelectAlbumById(albumId);
      }
    },
    [focusTrigger, onSelectAlbumById, onSelectAllMedia]
  );

  const closeScreen = useCallback(() => {
    setIsOpen(false);
    phoneTriggerRef.current?.focus();
  }, []);

  if (isPhone) {
    return (
      <div ref={rootRef} className="gallery-album-menu gallery-album-menu--phone">
        <button
          ref={phoneTriggerRef}
          type="button"
          className={`ui-button ui-button--secondary ${GALLERY_ALBUM_TRIGGER_CLASS}`}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label={triggerLabel}
          onClick={() => setIsOpen(true)}
        >
          <TriggerContents name={name} count={count} />
        </button>
        {isOpen ? (
          <GalleryAlbumScreen
            albums={albums}
            selectedAlbumId={selectedAlbumId}
            onChoose={choose}
            onClose={closeScreen}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="gallery-album-menu">
      <DropdownMenu isOpen={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenu.Trigger
          className={`ui-button ui-button--secondary ${GALLERY_ALBUM_TRIGGER_CLASS}`}
          aria-label={triggerLabel}
        >
          <TriggerContents name={name} count={count} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          className="dockspace-page-menu__dropdown gallery-album-menu__dropdown"
          label="Albums"
          initialFocus="checked"
        >
          <DropdownMenu.RadioItem
            className="gallery-album-menu__item"
            checked={selectedAlbumId === null}
            onClick={() => choose(null)}
          >
            <span className="gallery-album-menu__check" aria-hidden="true">
              {selectedAlbumId === null ? <Check size={16} /> : null}
            </span>
            <span className="gallery-album-menu__item-name">All media</span>
          </DropdownMenu.RadioItem>
          {albums.length ? <DropdownMenu.Separator /> : null}
          {albums.map((album) => {
            const isCurrent = album.albumId === selectedAlbumId;
            return (
              <DropdownMenu.RadioItem
                key={album.albumId}
                className="gallery-album-menu__item"
                checked={isCurrent}
                aria-label={albumAccessibleName(album.name, album.mediaCount)}
                onClick={() => choose(album.albumId)}
              >
                <span className="gallery-album-menu__check" aria-hidden="true">
                  {isCurrent ? <Check size={16} /> : null}
                </span>
                <span className="gallery-album-menu__item-name" title={album.name}>
                  {album.name}
                </span>
                {typeof album.mediaCount === 'number' ? (
                  <span className="gallery-album-menu__item-count">{album.mediaCount}</span>
                ) : null}
              </DropdownMenu.RadioItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu>
    </div>
  );
};
