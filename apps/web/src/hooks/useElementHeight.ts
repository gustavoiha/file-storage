import { useLayoutEffect, useState } from 'react';

/**
 * The element's rendered (border-box) height in px, kept current with a ResizeObserver. 0 while there is no element,
 * or where ResizeObserver is missing (then only the first measurement is taken).
 */
export const useElementHeight = (element: HTMLElement | null): number => {
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    if (!element) {
      setHeight(0);
      return;
    }

    const measure = () => setHeight(element.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return height;
};
