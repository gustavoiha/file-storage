import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const layoutCss = stripComments(readFileSync(resolve(__dirname, '../../styles/layout.css'), 'utf8'));

const bodiesFor = (selector: string) =>
  Array.from(layoutCss.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .filter(([, selectorText = '']) => selectorText.split(',').map((part) => part.trim()).includes(selector))
    .map(([, , body = '']) => body);

// jsdom has no scroll anchoring, so this guards the CSS that keeps it off. With anchoring on, Chrome anchored to the
// always-mounted end-of-list footer: a page that landed while the user waited at the end of the loaded media moved
// the view down by the whole page, and the next page then loaded at once, until the library ran out (T-0029).
describe('media grid scroll anchoring', () => {
  it('turns scroll anchoring off on the virtual grid scroll box', () => {
    const bodies = bodiesFor('.media-grid-virtual');
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.some((body) => /overflow-anchor:\s*none\s*;/.test(body))).toBe(true);
  });

  it('does not turn it back on anywhere in the grid', () => {
    expect(layoutCss).not.toMatch(/\.media-grid[^{}]*\{[^{}]*overflow-anchor:\s*auto/);
  });
});
