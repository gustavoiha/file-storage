import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useElementHeight } from '@/hooks/useElementHeight';

let observedCallback: (() => void) | null = null;
const disconnect = vi.fn();

class FakeResizeObserver {
  constructor(callback: () => void) {
    observedCallback = callback;
  }
  observe() {}
  disconnect() {
    disconnect();
  }
}

const Probe = ({ show = true }: { show?: boolean }) => {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const height = useElementHeight(element);
  return (
    <>
      {show ? <div ref={setElement} data-testid="target" /> : null}
      <output data-testid="height">{height}</output>
    </>
  );
};

describe('useElementHeight', () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  let currentHeight = 142.75;

  afterEach(() => {
    cleanup();
    globalThis.ResizeObserver = originalResizeObserver;
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    observedCallback = null;
    disconnect.mockClear();
  });

  const mockRect = () => {
    HTMLElement.prototype.getBoundingClientRect = function () {
      return { height: (this as HTMLElement).dataset.testid === 'target' ? currentHeight : 0 } as DOMRect;
    };
  };

  it('measures the element and follows its size changes', () => {
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    currentHeight = 142.75;
    mockRect();

    render(<Probe />);
    expect(screen.getByTestId('height')).toHaveTextContent('142.75');

    currentHeight = 122;
    act(() => observedCallback?.());
    expect(screen.getByTestId('height')).toHaveTextContent('122');
  });

  it('is 0 without an element and stops observing when it goes away', () => {
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    currentHeight = 60;
    mockRect();

    const { rerender } = render(<Probe />);
    expect(screen.getByTestId('height')).toHaveTextContent('60');

    rerender(<Probe show={false} />);
    expect(screen.getByTestId('height')).toHaveTextContent('0');
    expect(disconnect).toHaveBeenCalled();
  });
});
