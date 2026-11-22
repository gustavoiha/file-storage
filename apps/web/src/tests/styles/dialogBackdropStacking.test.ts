import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutCss = readFileSync(resolve(__dirname, '../../styles/layout.css'), 'utf8');

/** The z-index declared by the top-level rules whose selector list includes `selector`. */
const zIndexOf = (selector: string): number => {
  const values: number[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(layoutCss)) !== null) {
    const [, selectorText = '', body = ''] = match;
    const selectors = selectorText.replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((part) => part.trim());
    const zIndex = /z-index:\s*(\d+)/.exec(body.replace(/\/\*[\s\S]*?\*\//g, ''));
    if (selectors.includes(selector) && zIndex) {
      values.push(Number(zIndex[1]));
    }
  }
  expect(values, `z-index of ${selector}`).toHaveLength(1);
  return values[0] as number;
};

describe('dialog backdrop stacking', () => {
  const backdrop = zIndexOf('.dockspace-dialog-backdrop');

  it('puts modal dialogs above the sticky header, so the tabs and the switcher bar cannot be clicked', () => {
    expect(backdrop).toBeGreaterThan(zIndexOf('.app-header'));
    expect(backdrop).toBeGreaterThan(zIndexOf('.top-nav'));
  });

  it('puts modal dialogs above the phone switcher list', () => {
    expect(backdrop).toBeGreaterThan(zIndexOf('.dockspace-switcher-screen'));
  });

  it('keeps the switcher create dialog and the file viewer above the base backdrop', () => {
    expect(zIndexOf('.dockspace-dialog-backdrop.dockspace-dialog-backdrop--switcher')).toBeGreaterThan(backdrop);
    expect(zIndexOf('.dockspace-dialog-backdrop--viewer')).toBeGreaterThan(backdrop);
  });
});
