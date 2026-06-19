export const resolveTemplateElement = (value: unknown): HTMLElement | null => {
  if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) return value;
  if (!value || typeof value !== 'object') return null;

  const el = (value as {$el?: unknown}).$el;
  return typeof HTMLElement !== 'undefined' && el instanceof HTMLElement ? el : null;
};

export const queryTemplateElements = <T extends HTMLElement = HTMLElement>(
  value: unknown,
  selector: string,
): T[] => {
  const el = resolveTemplateElement(value);
  if (!el) return [];
  return Array.from(el.querySelectorAll<T>(selector));
};
