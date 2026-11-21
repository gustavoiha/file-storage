import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutCss = readFileSync(resolve(__dirname, '../../styles/layout.css'), 'utf8');

interface Rule {
  selectors: string[];
  body: string;
  index: number;
}

const rules: Rule[] = (() => {
  const parsed: Rule[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(layoutCss)) !== null) {
    const [, selectorText = '', body = ''] = match;
    const selectors = selectorText
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(',')
      .map((part) => part.trim());
    parsed.push({ selectors, body, index: match.index });
  }
  return parsed;
})();

const rulesFor = (selector: string): Rule[] => rules.filter((rule) => rule.selectors.includes(selector));
const bodiesFor = (selector: string): string => rulesFor(selector).map((rule) => rule.body).join('\n');

const CURRENT = '.dockspace-column__row[aria-current]';
const CURRENT_FOCUS = '.dockspace-column__row[aria-current]:focus-visible';
const ROW_FOCUS = '.dockspace-column__row:focus-visible';

describe('ancestor column current row keyboard focus', () => {
  it('draws an accent outline inside the current row on :focus-visible', () => {
    const declarations = bodiesFor(CURRENT_FOCUS);
    expect(declarations).toMatch(/outline:\s*2px solid var\(--accent\)/);
    expect(declarations).toMatch(/outline-offset:\s*-2px/);
  });

  it('comes after the current-row rule and is not reset by a later one', () => {
    const focusRules = rulesFor(CURRENT_FOCUS);
    const currentRules = rulesFor(CURRENT);
    expect(focusRules.length).toBeGreaterThan(0);
    const lastFocusIndex = Math.max(...focusRules.map((rule) => rule.index));
    expect(currentRules.every((rule) => rule.index < lastFocusIndex)).toBe(true);
  });

  it('keeps the current-row fill and accent left bar while focused', () => {
    const focused = bodiesFor(CURRENT_FOCUS);
    expect(focused).not.toMatch(/box-shadow|background/);
    const current = bodiesFor(CURRENT);
    expect(current).toMatch(/background:\s*rgba\(77, 168, 255, 0\.18\)/);
    expect(current).toMatch(/box-shadow:\s*inset 3px 0 0 var\(--accent\)/);
    expect(current).not.toMatch(/outline/);
  });

  it('rings only on :focus-visible, never on plain :focus', () => {
    expect(rulesFor('.dockspace-column__row[aria-current]:focus')).toHaveLength(0);
    expect(rulesFor('.dockspace-column__row:focus')).toHaveLength(0);
  });

  it('leaves the non-current row focus style unchanged', () => {
    const declarations = bodiesFor(ROW_FOCUS);
    expect(declarations).toMatch(/outline:\s*none/);
    expect(declarations).toMatch(/box-shadow:\s*inset 0 0 0 1px rgba\(47, 121, 201, 0\.75\)/);
  });
});
