import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const layoutCss = stripComments(readFileSync(resolve(__dirname, '../../styles/layout.css'), 'utf8'));

const SUPPORTS_NO_HAS = /@supports not selector\(:has\(\*\)\)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g;

interface Rule {
  selectors: string[];
  body: string;
  index: number;
}

const parseRules = (css: string): Rule[] =>
  Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g), (match) => ({
    selectors: (match[1] ?? '').split(',').map((part) => part.trim()),
    body: match[2] ?? '',
    index: match.index ?? 0
  }));

const fallbackCss = Array.from(layoutCss.matchAll(SUPPORTS_NO_HAS), (match) => match[1] ?? '').join('\n');
// Rules every browser applies: the :has() fallback block removed.
const mainRules = parseRules(layoutCss.replace(SUPPORTS_NO_HAS, ''));
const fallbackRules = parseRules(fallbackCss);

const ROW = '.dockspace-browser__list .resource-list__item';
const HIGHLIGHT = /box-shadow:\s*inset 0 0 0 1px|border-bottom-color:\s*var\(--accent-soft\)/;

const bodiesFor = (rules: Rule[], selector: string) =>
  rules.filter((rule) => rule.selectors.includes(selector)).map((rule) => rule.body);

describe('file list row focus highlight (keyboard only)', () => {
  it('draws the inset ring and accent bottom border when focus inside the row is keyboard focus', () => {
    const declarations = bodiesFor(mainRules, `${ROW}:has(:focus-visible)`).join('\n');
    expect(declarations).toMatch(/box-shadow:\s*inset 0 0 0 1px rgba\(47, 121, 201, 0\.55\)/);
    expect(declarations).toMatch(/border-bottom-color:\s*var\(--accent-soft\)/);
    expect(declarations).toMatch(/background:\s*rgba\(77, 168, 255, 0\.15\)/);
  });

  it('keeps the :has() selector alone in its rule, so older browsers drop only that rule', () => {
    for (const rule of mainRules.filter((candidate) => candidate.selectors.some((s) => s.includes(':has(')))) {
      expect(rule.selectors).toHaveLength(1);
    }
  });

  it('does not highlight a row for mouse focus (no :focus-within highlight outside the fallback)', () => {
    const mouseFocusHighlights = mainRules.filter(
      (rule) =>
        rule.selectors.some((selector) => /\.resource-list__item:focus-within$/.test(selector)) &&
        HIGHLIGHT.test(rule.body)
    );
    expect(mouseFocusHighlights).toEqual([]);
  });

  it('keeps the hover style unchanged', () => {
    const hover = bodiesFor(mainRules, `${ROW}:hover`).join('\n');
    expect(hover).toMatch(/background:\s*rgba\(77, 168, 255, 0\.1\)/);
    expect(hover).not.toMatch(HIGHLIGHT);
  });

  it('falls back to :focus-within in browsers without :has()', () => {
    const declarations = bodiesFor(fallbackRules, `${ROW}:focus-within`).join('\n');
    expect(declarations).toMatch(/box-shadow:\s*inset 0 0 0 1px rgba\(47, 121, 201, 0\.55\)/);
    expect(declarations).toMatch(/border-bottom-color:\s*var\(--accent-soft\)/);
  });

  it('still shows the actions trigger whenever focus is anywhere in the row', () => {
    const triggerRule = mainRules.find((rule) =>
      rule.selectors.includes('.dockspace-browser__file-item:focus-within .dockspace-browser__file-actions-trigger')
    );
    expect(triggerRule?.selectors).toContain(
      '.dockspace-browser__folder-item:focus-within .dockspace-browser__file-actions-trigger'
    );
    expect(triggerRule?.body).toMatch(/opacity:\s*1/);
    expect(triggerRule?.body).toMatch(/pointer-events:\s*auto/);
  });

  it('keeps the empty-state row free of the highlight, after the highlight rule', () => {
    const highlight = mainRules.find((rule) => rule.selectors.includes(`${ROW}:has(:focus-visible)`));
    const empty = mainRules.find((rule) =>
      rule.selectors.includes('.dockspace-browser__list .dockspace-browser__empty-item:focus-within')
    );
    expect(empty?.body).toMatch(/box-shadow:\s*none/);
    expect(empty?.body).toMatch(/border-bottom-color:\s*var\(--border\)/);
    expect(highlight && empty && empty.index > highlight.index).toBe(true);
    // The fallback block sits before the empty-state override in the file, so the override wins there too.
    expect(layoutCss.indexOf('@supports not selector(:has(*))')).toBeLessThan(
      layoutCss.indexOf('.dockspace-browser__list .dockspace-browser__empty-item:hover')
    );
  });
});
