import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ref } from 'react';
import { AppShell } from '@/components/ui/AppShell';

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div data-testid="page" />
}));

vi.mock('@/components/ui/DockspaceSwitcher', () => ({
  useDockspaceSwitcherVariant: () => 'bar'
}));

vi.mock('@/components/ui/TopNav', () => ({
  TopNav: ({ headerRef }: { headerRef?: Ref<HTMLDivElement> }) => <div ref={headerRef} className="app-header" />
}));

describe('AppShell', () => {
  const originalRect = HTMLElement.prototype.getBoundingClientRect;

  afterEach(() => {
    cleanup();
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  });

  it('sizes full-height pages from the measured header, not the CSS estimate', () => {
    // On a phone below 720px the top nav stacks its rows: the header is taller than 3.75rem + the switcher bar.
    HTMLElement.prototype.getBoundingClientRect = function () {
      return { height: (this as HTMLElement).classList.contains('app-header') ? 142.75 : 0 } as DOMRect;
    };

    const { container } = render(<AppShell />);

    const body = container.querySelector<HTMLElement>('.app-shell__body');
    expect(body?.style.getPropertyValue('--app-top-nav-height')).toBe('142.75px');
  });

  it('keeps the CSS estimate until the header has a size', () => {
    const { container } = render(<AppShell />);

    const body = container.querySelector<HTMLElement>('.app-shell__body');
    expect(body?.style.getPropertyValue('--app-top-nav-height')).toBe('');
  });
});
