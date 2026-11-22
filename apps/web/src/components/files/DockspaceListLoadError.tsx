import type { FocusEvent } from 'react';
import { Alert } from '@/components/ui/Alert';

interface DockspaceListLoadErrorProps {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
  focusHandlers: {
    onFocus: () => void;
    onBlur: (event: FocusEvent<HTMLButtonElement>) => void;
  };
}

/** The failed dockspace list: the error with a Try again that stays mounted (marked busy) while it runs. */
export const DockspaceListLoadError = ({ message, isRetrying, onRetry, focusHandlers }: DockspaceListLoadErrorProps) => (
  <Alert
    message={message}
    action={
      // aria-disabled, not disabled: a disabled button would drop its focus.
      <button
        type="button"
        className="dockspace-link-button"
        aria-disabled={isRetrying ? 'true' : undefined}
        aria-busy={isRetrying ? 'true' : undefined}
        onClick={() => {
          if (!isRetrying) {
            onRetry();
          }
        }}
        {...focusHandlers}
      >
        {isRetrying ? 'Trying again…' : 'Try again'}
      </button>
    }
  />
);
