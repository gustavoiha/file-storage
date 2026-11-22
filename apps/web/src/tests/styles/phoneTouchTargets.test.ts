import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const layoutCss = stripComments(readFileSync(resolve(__dirname, '../../styles/layout.css'), 'utf8'));
const uiCss = stripComments(readFileSync(resolve(__dirname, '../../styles/ui.css'), 'utf8'));

const bodiesFor = (css: string, selector: string) =>
  Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .filter(([, selectorText = '']) => selectorText.split(',').map((part) => part.trim()).includes(selector))
    .map(([, , body = '']) => body);

const hasMinHeight44 = (css: string, selector: string) =>
  bodiesFor(css, selector).some((body) => /min-height:\s*2\.75rem\s*;/.test(body));

// jsdom does not lay out, so these guard the CSS that gives phone controls 44px touch targets (T-0038).
describe('phone touch targets', () => {
  it('makes the collapsed uploads pill 44px tall on the phone gallery and the phone files page', () => {
    expect(hasMinHeight44(layoutCss, '.media-workspace__floating--phone .dockspace-uploads__pill')).toBe(true);
    expect(hasMinHeight44(layoutCss, '.dockspace-files--phone .dockspace-files__floating .dockspace-uploads__pill')).toBe(
      true
    );
  });

  it('makes the phone files page floating Upload button 44px tall, level with the uploads pill (T-0046)', () => {
    expect(hasMinHeight44(layoutCss, '.dockspace-upload-menu--floating .dockspace-upload-menu__trigger')).toBe(true);
    // Both sit in the same flex row aligned to the bottom, so equal heights give equal tops.
    const floatingRow = bodiesFor(layoutCss, '.dockspace-files--phone .dockspace-files__floating');
    expect(floatingRow.some((body) => /align-items:\s*flex-end\s*;/.test(body))).toBe(true);
  });

  it('leaves the desktop Upload button in the folder bar without a 44px minimum', () => {
    expect(bodiesFor(layoutCss, '.dockspace-upload-menu__trigger').some((body) => /min-height/.test(body))).toBe(false);
    expect(
      bodiesFor(layoutCss, '.dockspace-upload-menu--bar .dockspace-upload-menu__trigger').some((body) =>
        /min-height/.test(body)
      )
    ).toBe(false);
    expect(bodiesFor(uiCss, '.ui-button').some((body) => /min-height/.test(body))).toBe(false);
  });

  it('makes the gallery selection bar buttons 44px tall on phone', () => {
    expect(hasMinHeight44(layoutCss, '.media-workspace--phone .media-workspace__bulk-actions--phone .ui-button')).toBe(
      true
    );
  });

  it('leaves the desktop pill and small buttons without a 44px minimum', () => {
    expect(bodiesFor(layoutCss, '.dockspace-uploads__pill').some((body) => /min-height/.test(body))).toBe(false);
    expect(bodiesFor(uiCss, '.ui-button--sm').some((body) => /min-height/.test(body))).toBe(false);
    expect(bodiesFor(layoutCss, '.media-workspace__bulk-actions').some((body) => /min-height/.test(body))).toBe(false);
  });

  it('does not remove the focus outline from the changed controls', () => {
    for (const selector of [
      '.dockspace-uploads__pill',
      '.media-workspace__floating--phone .dockspace-uploads__pill',
      '.dockspace-files--phone .dockspace-files__floating .dockspace-uploads__pill',
      '.media-workspace--phone .media-workspace__bulk-actions--phone .ui-button',
      '.dockspace-upload-menu--floating .dockspace-upload-menu__trigger'
    ]) {
      expect(bodiesFor(layoutCss, selector).some((body) => /outline:\s*(none|0)\s*;/.test(body))).toBe(false);
    }
  });
});
