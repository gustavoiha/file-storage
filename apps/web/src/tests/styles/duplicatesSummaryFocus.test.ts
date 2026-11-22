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

// The Find duplicates summary takes focus after a confirmed trash leaves Move selected to trash disabled (T-0040).
describe('.media-duplicates__summary focus ring', () => {
  const summary = '.media-duplicates__summary';

  it('draws the 2px accent outline on :focus-visible (a real outline, kept in forced colors)', () => {
    expect(bodiesFor(`${summary}:focus-visible`).join('\n')).toMatch(/outline:\s*2px solid var\(--accent\)/);
  });

  it('shows no ring when it takes focus after a mouse action', () => {
    expect(bodiesFor(`${summary}:focus`).join('\n')).toMatch(/outline:\s*none/);
  });

  it('is not overridden by another rule for the summary', () => {
    const others = rules.filter(
      (rule) =>
        rule.selectors.includes(summary) &&
        !rule.selectors.includes(`${summary}:focus`) &&
        !rule.selectors.includes(`${summary}:focus-visible`)
    );
    expect(others.length).toBeGreaterThan(0);
    for (const rule of others) {
      expect(rule.body).not.toMatch(/outline/);
    }
  });
});
