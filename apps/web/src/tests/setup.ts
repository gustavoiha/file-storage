import '@testing-library/jest-dom/vitest';

Object.assign(import.meta.env, {
  VITE_API_BASE_URL: 'https://api.example.com',
  VITE_COGNITO_USER_POOL_ID: 'us-east-1_example',
  VITE_COGNITO_CLIENT_ID: 'exampleclient'
});

// jsdom has no PointerEvent, so fireEvent.pointerDown(..., { pointerType }) would drop the pointer fields.
if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? '';
      this.isPrimary = init.isPrimary ?? true;
    }
  }

  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}
