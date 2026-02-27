import { useEffect, type MouseEventHandler } from 'react';

interface UseDialogDismissOptions {
  isOpen: boolean;
  onClose: () => void;
}

export const useDialogDismiss = ({ isOpen, onClose }: UseDialogDismissOptions) => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      onClose();
    };

    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      document.removeEventListener('keydown', onDocumentKeyDown);
    };
  }, [isOpen, onClose]);

  const onBackdropMouseDown: MouseEventHandler<HTMLDivElement> = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return { onBackdropMouseDown };
};
