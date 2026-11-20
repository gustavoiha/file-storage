import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent
} from 'react';

export interface LongPressPoint {
  x: number;
  y: number;
}

export const LONG_PRESS_DELAY_MS = 500;
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
/** Pressed feedback starts a little later so quick taps and scrolls do not flash. */
export const LONG_PRESS_FEEDBACK_DELAY_MS = 150;

interface UseLongPressOptions {
  /** When false, presses are ignored (and a press in progress is cancelled). */
  enabled: boolean;
  /** Called with the point where the press started, once the press has been held long enough. */
  onLongPress: (point: LongPressPoint) => void;
  delayMs?: number;
  moveTolerancePx?: number;
  feedbackDelayMs?: number;
}

export interface LongPressHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onClickCapture: (event: MouseEvent<HTMLElement>) => void;
}

export interface UseLongPressResult {
  /** True while a touch press is being held (after the feedback delay) and has not fired yet. */
  isPressed: boolean;
  handlers: LongPressHandlers;
  /**
   * For a `contextmenu` event that arrives during a touch press (Android fires one on long-press).
   * Returns true when this press already fired `onLongPress`, so the caller should ignore the event.
   * Otherwise, if a touch press is in progress, cancels its timer and swallows the click that follows,
   * so the caller can open the menu from the event instead (one code path, never two menus).
   */
  claim: () => boolean;
}

const isTouchLike = (pointerType: string | undefined) => pointerType === 'touch' || pointerType === 'pen';

/**
 * Detects a touch or pen press held for `delayMs` without moving more than `moveTolerancePx`.
 * Mouse input is ignored. After a long press fires, the click that follows the release is swallowed.
 */
export const useLongPress = ({
  enabled,
  onLongPress,
  delayMs = LONG_PRESS_DELAY_MS,
  moveTolerancePx = LONG_PRESS_MOVE_TOLERANCE_PX,
  feedbackDelayMs = LONG_PRESS_FEEDBACK_DELAY_MS
}: UseLongPressOptions): UseLongPressResult => {
  const [isPressed, setIsPressed] = useState(false);
  const startRef = useRef<LongPressPoint | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const fireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const swallowClickRef = useRef(false);
  const onLongPressRef = useRef(onLongPress);

  useEffect(() => {
    onLongPressRef.current = onLongPress;
  }, [onLongPress]);

  const clearTimers = useCallback(() => {
    if (fireTimerRef.current !== null) {
      clearTimeout(fireTimerRef.current);
      fireTimerRef.current = null;
    }

    if (feedbackTimerRef.current !== null) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clearTimers();
    startRef.current = null;
    pointerIdRef.current = null;
    setIsPressed(false);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    if (!enabled) {
      cancel();
    }
  }, [cancel, enabled]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      swallowClickRef.current = false;
      firedRef.current = false;
      cancel();

      if (!enabled || !isTouchLike(event.pointerType) || event.isPrimary === false) {
        return;
      }

      const point = { x: event.clientX, y: event.clientY };
      startRef.current = point;
      pointerIdRef.current = event.pointerId ?? null;
      feedbackTimerRef.current = setTimeout(() => {
        feedbackTimerRef.current = null;
        setIsPressed(true);
      }, feedbackDelayMs);
      fireTimerRef.current = setTimeout(() => {
        fireTimerRef.current = null;
        cancel();
        firedRef.current = true;
        swallowClickRef.current = true;
        try {
          navigator.vibrate?.(10);
        } catch {
          // Vibration is optional feedback.
        }
        onLongPressRef.current(point);
      }, delayMs);
    },
    [cancel, delayMs, enabled, feedbackDelayMs]
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const start = startRef.current;
      if (!start) {
        return;
      }

      if (pointerIdRef.current !== null && event.pointerId !== undefined && event.pointerId !== pointerIdRef.current) {
        return;
      }

      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > moveTolerancePx) {
        cancel();
      }
    },
    [cancel, moveTolerancePx]
  );

  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!swallowClickRef.current) {
      return;
    }

    swallowClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const claim = useCallback(() => {
    if (firedRef.current) {
      return true;
    }

    if (startRef.current) {
      cancel();
      firedRef.current = true;
      swallowClickRef.current = true;
    }

    return false;
  }, [cancel]);

  return {
    isPressed,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onClickCapture
    },
    claim
  };
};
