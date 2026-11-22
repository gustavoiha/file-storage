import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChartColumn, CheckSquare, Copy, Images, Trash2 } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/DropdownMenu';

interface GalleryOptionsMenuProps {
  dockspaceId: string;
  /** In an album, Find duplicates is shown but disabled (it works on All media only). */
  isInAlbum: boolean;
  duplicatesVisible: boolean;
  onToggleDuplicates: () => void;
  /** Phone only: shows "Select items", which turns on selection mode. Omit to hide it. */
  onStartSelection?: (() => void) | undefined;
}

/** The gallery's ⋯ menu: actions only (switching albums is the album menu's job). */
export const GalleryOptionsMenu = ({
  dockspaceId,
  isInAlbum,
  duplicatesVisible,
  onToggleDuplicates,
  onStartSelection
}: GalleryOptionsMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // A chosen item goes away with the menu: focus moves to the ⋯ button first instead of falling to <body>.
  const focusTrigger = () => {
    rootRef.current?.querySelector<HTMLElement>('.dropdown-menu__trigger')?.focus();
  };

  return (
    <div ref={rootRef} className="gallery-options-menu">
      <DropdownMenu className="dockspace-page-menu" isOpen={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenu.Trigger className="dockspace-page-menu__trigger" aria-label="Gallery options">
          ⋯
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          className="dockspace-page-menu__dropdown gallery-options-menu__dropdown"
          label="Gallery options"
        >
          {onStartSelection ? (
            <>
              <DropdownMenu.Button
                className="dockspace-page-menu__item gallery-options-menu__item"
                onClick={() => {
                  focusTrigger();
                  onStartSelection();
                }}
              >
                <CheckSquare size={16} aria-hidden="true" className="gallery-options-menu__icon" />
                Select items
              </DropdownMenu.Button>
              <DropdownMenu.Separator />
            </>
          ) : null}
          {isInAlbum ? (
            <DropdownMenu.Button
              className="dockspace-page-menu__item gallery-options-menu__item"
              aria-disabled="true"
              onClick={(event) => {
                // Disabled: the click does nothing and the menu stays open.
                event.preventDefault();
              }}
            >
              <Copy size={16} aria-hidden="true" className="gallery-options-menu__icon" />
              Find duplicates
              <span className="gallery-options-menu__hint">All media only</span>
            </DropdownMenu.Button>
          ) : (
            <DropdownMenu.Button
              className="dockspace-page-menu__item gallery-options-menu__item"
              onClick={() => {
                focusTrigger();
                onToggleDuplicates();
              }}
            >
              {duplicatesVisible ? (
                <Images size={16} aria-hidden="true" className="gallery-options-menu__icon" />
              ) : (
                <Copy size={16} aria-hidden="true" className="gallery-options-menu__icon" />
              )}
              {duplicatesVisible ? 'Browse media' : 'Find duplicates'}
            </DropdownMenu.Button>
          )}
          <DropdownMenu.Separator />
          <DropdownMenu.Link asChild className="dockspace-page-menu__item gallery-options-menu__item">
            <Link to="/dockspaces/$dockspaceId/trash" params={{ dockspaceId }}>
              <Trash2 size={16} aria-hidden="true" className="gallery-options-menu__icon" />
              Trash
            </Link>
          </DropdownMenu.Link>
          <DropdownMenu.Link asChild className="dockspace-page-menu__item gallery-options-menu__item">
            <Link to="/dockspaces/$dockspaceId/usage" params={{ dockspaceId }}>
              <ChartColumn size={16} aria-hidden="true" className="gallery-options-menu__icon" />
              Detailed usage
            </Link>
          </DropdownMenu.Link>
        </DropdownMenu.Content>
      </DropdownMenu>
    </div>
  );
};
