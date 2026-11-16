export type AssistantStreamEvent = {
  type?: 'delta' | 'final' | 'error' | 'done';
  text?: string;
  data?: unknown;
  error?: string;
};

export const buildWiseMindDeepLink = (payload: Record<string, unknown>) => {
  const url = new URL('wisemindai://open');
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  });
  return url.toString();
};

export const normalizeBaseUrl = (value: string) => {
  const trimmed = (value || 'http://127.0.0.1:38221').trim();
  return trimmed.replace(/\/+$/, '');
};

export const toQuery = (params: Record<string, string | number | boolean | undefined | null>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  return text ? `?${text}` : '';
};

export const normalizeNullable = (value?: string | number | null) => {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
};

export const parseStreamLine = (line: string): AssistantStreamEvent | null => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as AssistantStreamEvent;
  } catch {
    return null;
  }
};

/** Keeps note bodies out of error details; only the length and a short preview are kept. */
export const sanitizeRequestBody = (value: unknown) => {
  if (!value || typeof value !== 'object') return value;
  const body = {...value as Record<string, unknown>};
  if (typeof body.content === 'string') {
    body.contentLength = body.content.length;
    body.contentPreview = body.content.slice(0, 300);
    delete body.content;
  }
  return body;
};
