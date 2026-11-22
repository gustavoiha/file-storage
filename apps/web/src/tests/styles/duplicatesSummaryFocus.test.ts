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

  // T-0044: the ring touched the first character because the summary had no padding.
  describe('space between the ring and the text', () => {
    const remToPx = (value: string) => {
      const match = value.trim().match(/^(-?[\d.]+)(rem|px)?$/);
      if (!match) {
        throw new Error(`Unexpected length: ${value}`);
      }
      return Number(match[1]) * (match[2] === 'rem' ? 16 : 1);
    };
    // Shorthand with one or two values: [block, inline].
    const boxSides = (value: string): [number, number] => {
      const parts = value.trim().split(/\s+/).map(remToPx);
      if (parts.length === 1) {
        return [parts[0]!, parts[0]!];
      }
      if (parts.length === 2) {
        return [parts[0]!, parts[1]!];
      }
      throw new Error(`Expected one or two values: ${value}`);
    };
    const declaration = (body: string, property: string) => {
      const match = body.match(new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;]+);`));
      if (!match?.[1]) {
        throw new Error(`Missing ${property}`);
      }
      return match[1];
    };
    const baseBody = () => {
      const bodies = rules.filter((rule) => rule.selectors.length === 1 && rule.selectors[0] === summary);
      // The first one is the base rule; later ones are @media overrides.
      expect(bodies.length).toBeGreaterThan(0);
      return bodies[0]!.body;
    };

    it('pads the summary so the ring clears the text on every side', () => {
      const [block, inline] = boxSides(declaration(baseBody(), 'padding'));
      expect(block).toBeGreaterThanOrEqual(4);
      expect(inline).toBeGreaterThanOrEqual(6);
    });

    it('cancels the padding with a matching negative margin, so the unfocused layout is unchanged', () => {
      const body = baseBody();
      const [padBlock, padInline] = boxSides(declaration(body, 'padding'));
      const [marginBlock, marginInline] = boxSides(declaration(body, 'margin'));
      expect(marginBlock).toBe(-padBlock);
      expect(marginInline).toBe(-padInline);
    });

    it('keeps the padding and margin on phone (no @media rule resets them)', () => {
      const overrides = rules.filter((rule) => rule.selectors.includes(summary)).slice(1);
      for (const rule of overrides) {
        expect(rule.body).not.toMatch(/(?:^|[;\s])(padding|margin)(-[a-z-]+)?:/);
      }
    });

    it('keeps the ring inside the scroll box padding of .media-duplicates, so it is not clipped', () => {
      const [, padInline] = boxSides(declaration(baseBody(), 'padding'));
      const [marginBlock, marginInline] = boxSides(declaration(baseBody(), 'margin'));
      const ring = bodiesFor(`${summary}:focus-visible`).join('\n');
      const offset = remToPx(declaration(ring, 'outline-offset'));
      const width = remToPx(declaration(ring, 'outline').split(/\s+/)[0]!);
      const container = bodiesFor('.media-duplicates');
      expect(container.length).toBeGreaterThan(0);
      const [containerBlock, containerInline] = boxSides(declaration(container[0]!, 'padding'));
      expect(padInline).toBeGreaterThan(0);
      expect(-marginInline + offset + width).toBeLessThanOrEqual(containerInline);
      expect(-marginBlock + offset + width).toBeLessThanOrEqual(containerBlock);
    });
  });
});
