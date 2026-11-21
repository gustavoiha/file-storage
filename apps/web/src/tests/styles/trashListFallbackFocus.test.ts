import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const layoutCss = stripComments(readFileSync(resolve(__dirname, '../../styles/layout.css'), 'utf8'));

interface Rule {
  selectors: string[];
  body: string;
}

// Innermost rules only: a selector inside @media is still listed with its own body.
const rules: Rule[] = Array.from(layoutCss.matchAll(/([^{}]+)\{([^{}]*)\}/g), ([, selectorText = '', body = '']) => ({
  selectors: selectorText.split(',').map((part) => part.trim()),
  body
}));

const bodiesFor = (selector: string) =>
  rules.filter((rule) => rule.selectors.includes(selector)).map((rule) => rule.body);

// The trash list and its empty message take focus after a restore or purge removes a row (T-0021).
describe.each(['.flat-file-list', '.flat-file-list__empty'])('%s focus ring', (fallback) => {
  it('draws the 2px accent outline on :focus-visible', () => {
    const declarations = bodiesFor(`${fallback}:focus-visible`).join('\n');
    expect(declarations).toMatch(/outline:\s*2px solid var\(--accent\)/);
  });

  it('shows no ring when it takes focus after a mouse action', () => {
    const declarations = bodiesFor(`${fallback}:focus`).join('\n');
    expect(declarations).toMatch(/outline:\s*none/);
  });

  it('is not overridden by any other rule for it or for the shared list class', () => {
    const others = rules.filter(
      (rule) =>
        rule.selectors.some((selector) =>
          [fallback, '.resource-list'].some((target) =>
            new RegExp(`^\\${target}(:[\\w-]+)?$`).test(selector)
          )
        ) &&
        !rule.selectors.includes(`${fallback}:focus`) &&
        !rule.selectors.includes(`${fallback}:focus-visible`)
    );
    expect(others.length).toBeGreaterThan(0);
    for (const rule of others) {
      expect(rule.body).not.toMatch(/outline/);
    }
  });
});
