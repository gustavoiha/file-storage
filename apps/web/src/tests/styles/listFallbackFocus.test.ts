import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const layoutCss = stripComments(readFileSync(resolve(__dirname, '../../styles/layout.css'), 'utf8'));
const themeCss = stripComments(readFileSync(resolve(__dirname, '../../styles/theme.css'), 'utf8'));

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

const themeColor = (token: string): string => {
  const match = themeCss.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) {
    throw new Error(`No hex value for ${token}`);
  }
  return match[1];
};

const luminance = (hex: string) => {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
};

describe('file list focus ring (dialog focus fallback)', () => {
  it('draws the 2px accent outline inside the list on :focus-visible', () => {
    const declarations = bodiesFor('.dockspace-browser__list:focus-visible').join('\n');
    expect(declarations).toMatch(/outline:\s*2px solid var\(--accent\)/);
    // Inset so the scrolling column and the phone layout do not clip it.
    expect(declarations).toMatch(/outline-offset:\s*-2px/);
  });

  it('shows no ring when the list takes focus from a mouse click', () => {
    const declarations = bodiesFor('.dockspace-browser__list:focus').join('\n');
    expect(declarations).toMatch(/outline:\s*none/);
  });

  it('is not overridden by any other list rule', () => {
    const others = rules.filter(
      (rule) =>
        rule.selectors.some((selector) => /\.dockspace-browser__list(:[\w-]+)?$/.test(selector)) &&
        !rule.selectors.some((selector) =>
          ['.dockspace-browser__list:focus', '.dockspace-browser__list:focus-visible'].includes(selector)
        )
    );
    expect(others.length).toBeGreaterThan(0);
    for (const rule of others) {
      expect(rule.body).not.toMatch(/outline/);
    }
  });

  it('meets 3:1 non-text contrast against the page surfaces', () => {
    const accent = themeColor('--accent');
    for (const surface of ['--bg', '--bg-soft', '--bg-elevated']) {
      expect(contrast(accent, themeColor(surface))).toBeGreaterThanOrEqual(3);
    }
  });
});
