const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:38221';

export const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
};

/** Local API may only target the same machine (pairing token / note bodies stay on-device). */
export const isLoopbackApiUrl = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return LOOPBACK_HOSTS.has(host) || host === '::1';
  } catch {
    return false;
  }
};

export const sanitizeApiBaseUrl = (value: string, fallback = DEFAULT_API_BASE_URL) => {
  const next = String(value || '').trim() || fallback;
  if (!isHttpUrl(next) || !isLoopbackApiUrl(next)) return fallback;
  return next.replace(/\/+$/, '');
};

export type ApiUrlCheck = 'ok' | 'invalid' | 'not-loopback';

export const checkApiBaseUrl = (value: string): ApiUrlCheck => {
  const next = String(value || '').trim();
  if (!next || !isHttpUrl(next)) return 'invalid';
  if (!isLoopbackApiUrl(next)) return 'not-loopback';
  return 'ok';
};
