import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const layoutCss = stripComments(readFileSync(resolve(__dirname, '../../styles/layout.css'), 'utf8'));

const bodiesFor = (css: string, selector: string) =>
  Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .filter(([, selectorText = '']) => selectorText.split(',').map((part) => part.trim()).includes(selector))
    .map(([, , body = '']) => body);

/** The text inside every `@media (forced-colors: active) { ... }` block. */
const forcedColorsBlocks = () => {
  const blocks: string[] = [];
  const pattern = /@media\s*\(forced-colors:\s*active\)\s*\{/g;
  for (const match of layoutCss.matchAll(pattern)) {
    let depth = 1;
    let index = (match.index ?? 0) + match[0].length;
    const start = index;
    while (index < layoutCss.length && depth > 0) {
      if (layoutCss[index] === '{') depth += 1;
      if (layoutCss[index] === '}') depth -= 1;
      index += 1;
    }
    blocks.push(layoutCss.slice(start, index - 1));
  }
  return blocks;
};

// jsdom does not lay out, draw scrollbars or emulate forced colors, so these guard the CSS (T-0030 review round 1).
describe('media grid tiles', () => {
  it('reserves the scrollbar space, so square rows do not change size when a classic scrollbar appears', () => {
    // Row height follows the box width: a scrollbar that took width when it appeared could shrink the rows enough to
    // remove itself again, and the grid would flicker between the two sizes.
    const bodies = bodiesFor(layoutCss, '.media-grid-virtual');
    expect(bodies.some((body) => /scrollbar-gutter:\s*stable\s*;/.test(body))).toBe(true);
  });

  it('keeps a real (transparent) outline on focused tiles, so forced-colors mode can draw it', () => {
    const bodies = bodiesFor(layoutCss, '.media-card:focus-visible');
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies.some((body) => /outline:\s*2px solid transparent\s*;/.test(body))).toBe(true);
    expect(bodies.some((body) => /outline:\s*(none|0)\s*;/.test(body))).toBe(false);
  });

  it('outlines selected tiles in forced-colors mode, where the overlay tint and ring are dropped', () => {
    const blocks = forcedColorsBlocks();
    const selected = blocks.flatMap((block) => bodiesFor(block, ".media-card[data-selected='true']"));
    expect(selected.some((body) => /outline:\s*\d+px solid Highlight\s*;/.test(body))).toBe(true);
    const selectedFocus = blocks.flatMap((block) =>
      bodiesFor(block, ".media-card[data-selected='true']:focus-visible")
    );
    expect(selectedFocus.some((body) => /outline:[^;]*Highlight\s*;/.test(body))).toBe(true);
  });
});
