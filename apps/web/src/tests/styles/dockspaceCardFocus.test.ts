import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutCss = readFileSync(resolve(__dirname, '../../styles/layout.css'), 'utf8');

const ruleBodiesFor = (selector: string): string[] => {
  const bodies: string[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(layoutCss)) !== null) {
    const [, selectorText = '', body = ''] = match;
    const selectors = selectorText.replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((part) => part.trim());
    if (selectors.includes(selector)) {
      bodies.push(body);
    }
  }
  return bodies;
};

describe('dockspace card keyboard focus ring', () => {
  it('draws an accent outline with an offset on :focus-visible', () => {
    const focusOnly = ruleBodiesFor('.dockspace-card:focus-visible').filter(
      (body) => !ruleBodiesFor('.dockspace-card:hover').includes(body)
    );
    const declarations = focusOnly.join('\n');
    expect(declarations).toMatch(/outline:\s*2px solid var\(--accent\)/);
    expect(declarations).toMatch(/outline-offset:\s*\dpx/);
  });

  it('keeps the hover style free of an outline ring', () => {
    const hoverOnly = ruleBodiesFor('.dockspace-card:hover').join('\n');
    expect(hoverOnly).not.toMatch(/outline:\s*2px/);
  });
});
