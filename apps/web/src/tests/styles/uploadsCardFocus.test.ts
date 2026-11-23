import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutCss = readFileSync(resolve(__dirname, '../../styles/layout.css'), 'utf8');

const rules = (): Array<{ selectors: string[]; body: string }> => {
  const found: Array<{ selectors: string[]; body: string }> = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(layoutCss)) !== null) {
    const [, selectorText = '', body = ''] = match;
    const selectors = selectorText
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(',')
      .map((part) => part.trim());
    found.push({ selectors, body });
  }
  return found;
};

// Collapse uploads and the collapsed pill hand focus to each other with .focus(), also after a click or tap (T-0050).
describe.each(['.dockspace-uploads__pill', '.dockspace-uploads__toggle'])('%s focus ring', (selector) => {
  it('draws a keyboard-only accent outline on :focus-visible', () => {
    const body = rules()
      .filter((rule) => rule.selectors.includes(`${selector}:focus-visible`))
      .map((rule) => rule.body)
      .join('\n');
    expect(body).toMatch(/outline:\s*2px solid var\(--accent\)/);
    expect(body).toMatch(/outline-offset:\s*\dpx/);
  });

  it('has no :focus or :focus-within ring that a mouse user would see', () => {
    const mouseFocusRules = rules().filter((rule) =>
      rule.selectors.some((part) => part.startsWith(`${selector}:focus`) && !part.endsWith(':focus-visible'))
    );
    expect(mouseFocusRules).toEqual([]);
  });
});
