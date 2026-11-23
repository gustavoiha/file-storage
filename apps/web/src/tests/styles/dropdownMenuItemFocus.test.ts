import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const layoutCss = stripComments(readFileSync(resolve(__dirname, '../../styles/layout.css'), 'utf8'));

interface Rule {
  selectors: string[];
  body: string;
}

// Top-level rules and rules inside one level of @media / @supports blocks.
const parseRules = (css: string): Rule[] =>
  Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g), (match) => ({
    selectors: (match[1] ?? '').split(',').map((part) => part.trim().replace(/^@[^{]*\{\s*/, '')),
    body: match[2] ?? ''
  }));

const rules = parseRules(layoutCss);

// Every class a DropdownMenu item carries in the app (DropdownMenu.Button / RadioItem / Link className props).
const MENU_ITEM_CLASSES = [
  'dropdown-menu__item',
  'dockspace-page-menu__item',
  'dockspace-browser__file-actions-item',
  'top-nav__account-item',
  'dockspace-switcher__create-menu-item',
  'gallery-options-menu__item',
  'gallery-album-menu__item'
];

const targetsMenuItem = (selector: string) =>
  MENU_ITEM_CLASSES.some((name) => new RegExp(`\\.${name}(?![\\w-])`).test(selector));

describe('dropdown menu item focus ring (T-0052)', () => {
  it('gives every DropdownMenu item the app 2px ring, drawn inside the item, on keyboard focus only', () => {
    const shared = rules.filter((rule) => rule.selectors.includes('.dropdown-menu__item:focus-visible'));
    expect(shared).toHaveLength(1);
    expect(shared[0]?.body).toMatch(/outline:\s*2px solid var\(--accent\)/);
    expect(shared[0]?.body).toMatch(/outline-offset:\s*-2px/);
  });

  it('has no per-menu outline rule that would make one menu look different', () => {
    const overrides = rules.filter(
      (rule) =>
        /outline(-offset)?\s*:/.test(rule.body) &&
        rule.selectors.some((selector) => targetsMenuItem(selector) && selector !== '.dropdown-menu__item:focus-visible')
    );
    expect(overrides.map((rule) => rule.selectors.join(', '))).toEqual([]);
  });

  it('never draws a menu item ring on :focus or :focus-within, which mouse and tap focus also match', () => {
    const mouseFocusRules = rules.filter((rule) =>
      rule.selectors.some((selector) => targetsMenuItem(selector) && /:focus(?!-visible)/.test(selector))
    );
    expect(mouseFocusRules.map((rule) => rule.selectors.join(', '))).toEqual([]);
  });

  it('does not change menu item size or spacing on focus (no padding, margin, border or size in focus rules)', () => {
    const focusRules = rules.filter((rule) =>
      rule.selectors.some((selector) => targetsMenuItem(selector) && selector.includes(':focus-visible'))
    );
    expect(focusRules.length).toBeGreaterThan(0);
    for (const rule of focusRules) {
      expect(rule.body).not.toMatch(/(^|[;\s])(padding|margin|border|width|height|min-height)[\w-]*\s*:/);
    }
  });
});
