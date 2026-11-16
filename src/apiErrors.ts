/** Normalized error codes; server codes such as MEMBERSHIP_LIMIT pass through unchanged. */
export type WiseMindApiErrorCode =
  | 'MEMBERSHIP_LIMIT'
  | 'AI_NOT_CONFIGURED'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'NOT_FOUND'
  | 'UNSUPPORTED'
  | 'TOO_LARGE'
  | 'HTTP'
  | (string & {});

export type WiseMindApiRequestDebug = {
  method: string;
  url: string;
  path: string;
  timeoutMs: number;
  requestBody?: unknown;
  status?: number;
  responseBody?: unknown;
  error?: string;
};

export const inferErrorCode = (status?: number, details?: WiseMindApiRequestDebug): WiseMindApiErrorCode => {
  const body = details?.responseBody as {code?: unknown} | undefined;
  if (body && typeof body === 'object' && typeof body.code === 'string' && body.code) return body.code;
  if (details?.error === 'timeout') return 'TIMEOUT';
  if (details?.error === 'aborted') return 'ABORTED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 405 || status === 501) return 'UNSUPPORTED';
  if (status === 413) return 'TOO_LARGE';
  if (!status) return 'NETWORK';
  return 'HTTP';
};

export class WiseMindApiError extends Error {
  status?: number;
  code: WiseMindApiErrorCode;
  details?: WiseMindApiRequestDebug;
  /** Quota errors report `{code, usage, limit}`; both stay undefined for other errors. */
  usage?: number;
  limit?: number;

  constructor(message: string, status?: number, details?: WiseMindApiRequestDebug, code?: WiseMindApiErrorCode) {
    super(message);
    this.name = 'WiseMindApiError';
    this.status = status;
    this.details = details;
    this.code = code || inferErrorCode(status, details);
    const body = details?.responseBody as {usage?: unknown; limit?: unknown} | undefined;
    if (body && typeof body === 'object') {
      if (typeof body.usage === 'number') this.usage = body.usage;
      if (typeof body.limit === 'number') this.limit = body.limit;
    }
  }
}

export const isMembershipLimitError = (error: unknown): error is WiseMindApiError =>
  error instanceof WiseMindApiError && error.code === 'MEMBERSHIP_LIMIT';

export const isAiNotConfiguredError = (error: unknown): error is WiseMindApiError =>
  error instanceof WiseMindApiError && error.code === 'AI_NOT_CONFIGURED';

export const isAbortError = (error: unknown) =>
  error instanceof WiseMindApiError ? error.code === 'ABORTED' : (error as Error)?.name === 'AbortError';

type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * The message shown to the user for a failed request. Codes the plugin understands get a translated
 * message; otherwise the desktop's own message wins, falling back to the HTTP status.
 */
export const describeApiError = (
  input: {code: WiseMindApiErrorCode; status?: number; serverMessage?: string},
  t: Translate,
) => {
  switch (input.code) {
    case 'NETWORK':
      return t('apiErrors.connectFailed');
    case 'AI_NOT_CONFIGURED':
      return t('capability.aiNotReadyNotice');
    case 'TOO_LARGE':
      return t('apiErrors.tooLarge');
    case 'NOT_FOUND':
      return input.serverMessage && input.serverMessage !== 'Not found' ? input.serverMessage : t('apiErrors.notFound');
    default:
      return input.serverMessage || t('apiErrors.requestFailed', {status: input.status ?? '-'});
  }
};
