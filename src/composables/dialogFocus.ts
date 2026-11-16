// Focus helpers shared by the reka dialogs and the two hand-rolled overlays (connection, task history).

const FIELD_SELECTOR = [
  '[autofocus]',
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not(:disabled)',
  'textarea:not(:disabled)',
].join(',');
const PRIMARY_SELECTOR = 'button.wm2-btn.is-primary:not(:disabled)';
const TABBABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const findInitialFocus = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(FIELD_SELECTOR) ||
  container.querySelector<HTMLElement>(PRIMARY_SELECTOR);

// reka-ui's default lands on the first tabbable element, which is the close button in our header.
// Prefer the first text field, then the primary action, then the dialog itself.
export const focusDialogInitial = (event: Event) => {
  const container = event.target instanceof HTMLElement ? event.target : null;
  if (!container) return;
  event.preventDefault();
  (findInitialFocus(container) || container).focus({preventScroll: true});
};

export const trapTabKey = (event: KeyboardEvent, container: HTMLElement | null) => {
  if (event.key !== 'Tab' || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
    item => item.offsetParent !== null,
  );
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = container.ownerDocument.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault();
    first.focus();
  }
};

// Returns a callback that puts focus back on whatever was focused when the overlay opened.
export const rememberFocus = () => {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  return () => {
    if (previous?.isConnected) previous.focus({preventScroll: true});
  };
};
