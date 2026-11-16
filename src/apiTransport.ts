import {openWiseMindConnectionDialog} from './services/connectionDialog';
import {
  describeApiError,
  WiseMindApiError,
  type WiseMindApiErrorCode,
  type WiseMindApiRequestDebug,
} from './apiErrors';
import {type AssistantStreamEvent, normalizeBaseUrl, parseStreamLine, sanitizeRequestBody} from './apiUtils';
import {translate} from './i18n';
import type {WiseMindLanguageSetting} from './types';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type AssistantStreamCallbacks<T = any> = {
  onDelta?: (text: string) => void;
  onFinal?: (data: T) => void;
  onEvent?: (event: AssistantStreamEvent) => void;
};

/** Endpoints that describe the client itself and must not be scoped to a learning space. */
const UNSCOPED_PATHS = [
  '/api/health',
  '/api/v2/health',
  '/api/capabilities',
  '/api/v2/workspace/state',
  '/api/v2/account/usage',
  '/api/v2/open-source',
];

/**
 * HTTP transport for the desktop local API: timeouts, cancellation, learning-space scoping,
 * NDJSON streams and readable errors. Endpoint methods live in WiseMindApiClient.
 */
export class WiseMindHttpClient {
  /** Called for every server error code, e.g. so AI_NOT_CONFIGURED can refresh the capability banner. */
  onErrorCode: ((code: WiseMindApiErrorCode) => void) | null = null;
  protected baseUrl: string;
  protected fetchImpl: FetchLike;
  protected timeoutMs: number;
  protected language: () => WiseMindLanguageSetting | undefined;
  protected workspaceId: () => string | undefined;

  constructor(
    baseUrl: string,
    fetchImpl: FetchLike = fetch.bind(globalThis),
    timeoutMs = 10000,
    language: () => WiseMindLanguageSetting | undefined = () => undefined,
    workspaceId: () => string | undefined = () => undefined,
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.language = language;
    this.workspaceId = workspaceId;
  }

  protected t(key: string, params?: Record<string, unknown>) {
    return translate(this.language(), key, params);
  }

  protected async getData<T>(
    path: string,
    options: {signal?: AbortSignal; showConnectionDialog?: boolean} = {},
  ): Promise<T> {
    const response = await this.request(path, {}, {
      signal: options.signal,
      showConnectionDialog: options.showConnectionDialog,
    });
    return (response?.data ?? []) as T;
  }

  protected async postData<T = any>(
    path: string,
    body: Record<string, unknown>,
    options: {timeoutMs?: number; signal?: AbortSignal; showConnectionDialog?: boolean} = {},
  ): Promise<T> {
    const response = await this.request(
      path,
      {method: 'POST', body: JSON.stringify(body)},
      {
        timeoutMs: options.timeoutMs,
        requestBody: body,
        signal: options.signal,
        showConnectionDialog: options.showConnectionDialog,
      },
    );
    return (response?.data ?? response) as T;
  }

  protected async postStream<T = any>(
    path: string,
    body: Record<string, unknown>,
    callbacks: AssistantStreamCallbacks<T>,
    options: {timeoutMs?: number; signal?: AbortSignal} = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || this.timeoutMs;
    const method = 'POST';
    const url = `${this.baseUrl}${path}`;
    body = this.scopeBody(path, body);
    const baseDebug: WiseMindApiRequestDebug = {
      method,
      url,
      path,
      timeoutMs,
      requestBody: sanitizeRequestBody(body),
    };
    const abortFromExternalSignal = () => controller.abort();
    if (options.signal?.aborted) {
      controller.abort();
    } else {
      options.signal?.addEventListener('abort', abortFromExternalSignal, {once: true});
    }
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    let finalData: T | undefined;
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        let parsed: any = {};
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          parsed = {error: text};
        }
        throw this.httpError(response.status, parsed, baseDebug);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new WiseMindApiError(this.t('apiErrors.streamingUnsupported'), response.status, {
          ...baseDebug,
          status: response.status,
        });
      }

      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          const event = parseStreamLine(line);
          if (!event) continue;
          callbacks.onEvent?.(event);
          if (event.type === 'delta' && event.text) {
            callbacks.onDelta?.(event.text);
          }
          if (event.type === 'final') {
            finalData = event.data as T;
            callbacks.onFinal?.(finalData);
          }
          if (event.type === 'error') {
            throw new WiseMindApiError(event.error || this.t('apiErrors.streamFailed'), response.status, {
              ...baseDebug,
              status: response.status,
              responseBody: event,
            });
          }
        }
      }

      if (buffer.trim()) {
        const event = parseStreamLine(buffer);
        if (event?.type === 'final') finalData = event.data as T;
        if (event?.type === 'error') {
          throw new WiseMindApiError(event.error || this.t('apiErrors.streamFailed'), response.status, {
            ...baseDebug,
            status: response.status,
            responseBody: event,
          });
        }
      }

      if (finalData === undefined) {
        throw new WiseMindApiError(this.t('apiErrors.noFinalResult'), response.status, {
          ...baseDebug,
          status: response.status,
        });
      }
      return finalData;
    } catch (error: any) {
      throw this.transportError(error, {...options, timeoutMs}, baseDebug);
    } finally {
      options.signal?.removeEventListener('abort', abortFromExternalSignal);
      globalThis.clearTimeout(timeout);
      // Stops the response body when a stream event failed mid-way; a finished stream ignores it.
      controller.abort();
    }
  }

  private httpError(status: number, body: any, baseDebug: WiseMindApiRequestDebug) {
    const error = new WiseMindApiError('', status, {...baseDebug, status, responseBody: body});
    error.message = describeApiError(
      {code: error.code, status, serverMessage: body?.error || body?.message},
      (key, params) => this.t(key, params),
    );
    if (body && typeof body === 'object' && typeof body.code === 'string') this.onErrorCode?.(body.code);
    return error;
  }

  /** Turns aborts, timeouts and connection failures into a WiseMindApiError with a readable message. */
  private transportError(
    error: any,
    options: {signal?: AbortSignal; timeoutMs: number; showConnectionDialog?: boolean},
    baseDebug: WiseMindApiRequestDebug,
  ) {
    if (error instanceof WiseMindApiError) return error;
    const showDialog = options.showConnectionDialog !== false;
    if (error?.name === 'AbortError') {
      const aborted = Boolean(options.signal?.aborted);
      if (!aborted && showDialog) openWiseMindConnectionDialog();
      return new WiseMindApiError(
        aborted ? this.t('apiErrors.aborted') : this.t('apiErrors.timeout', {seconds: Math.round(options.timeoutMs / 1000)}),
        undefined,
        {...baseDebug, error: aborted ? 'aborted' : 'timeout'},
      );
    }
    if (showDialog) openWiseMindConnectionDialog();
    return new WiseMindApiError(this.t('apiErrors.connectFailed'), undefined, {
      ...baseDebug,
      error: error?.message || 'network error',
    });
  }

  private isScoped(path: string) {
    const pathname = path.split('?')[0];
    return Boolean(this.workspaceId()) && !UNSCOPED_PATHS.includes(pathname);
  }

  /** Every scoped request carries the bound learning space unless the caller set one explicitly. */
  private scopeBody(path: string, body: Record<string, unknown>) {
    if (!this.isScoped(path) || body.workspaceId) return body;
    return {...body, workspaceId: this.workspaceId()};
  }

  private scopeRequest(path: string, init: RequestInit) {
    if (!this.isScoped(path)) return {path, init};
    const workspaceId = this.workspaceId() as string;
    const method = (init.method || 'GET').toUpperCase();
    if (method === 'GET') {
      if (/[?&]workspaceId=/.test(path)) return {path, init};
      return {path: `${path}${path.includes('?') ? '&' : '?'}workspaceId=${encodeURIComponent(workspaceId)}`, init};
    }
    if (typeof init.body !== 'string' || !init.body.startsWith('{')) return {path, init};
    try {
      const parsed = JSON.parse(init.body) as Record<string, unknown>;
      if (parsed.workspaceId) return {path, init};
      return {path, init: {...init, body: JSON.stringify({...parsed, workspaceId})}};
    } catch {
      return {path, init};
    }
  }

  protected async request(
    path: string,
    init: RequestInit = {},
    options: {
      timeoutMs?: number;
      requestBody?: unknown;
      signal?: AbortSignal;
      showConnectionDialog?: boolean;
    } = {},
  ) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || this.timeoutMs;
    const method = init.method || 'GET';
    ({path, init} = this.scopeRequest(path, init));
    const url = `${this.baseUrl}${path}`;
    const baseDebug: WiseMindApiRequestDebug = {
      method,
      url,
      path,
      timeoutMs,
      requestBody: sanitizeRequestBody(options.requestBody),
    };
    const abortFromExternalSignal = () => controller.abort();
    if (options.signal?.aborted) {
      controller.abort();
    } else {
      options.signal?.addEventListener('abort', abortFromExternalSignal, {once: true});
    }
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        },
        signal: controller.signal,
      });

      const text = await response.text();
      let json: any = {};
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          throw new WiseMindApiError(this.t('apiErrors.invalidJson'), response.status, {
            ...baseDebug,
            status: response.status,
            responseBody: text.slice(0, 1000),
          });
        }
      }

      if (!response.ok) throw this.httpError(response.status, json, baseDebug);

      return json;
    } catch (error: any) {
      throw this.transportError(error, {...options, timeoutMs}, baseDebug);
    } finally {
      options.signal?.removeEventListener('abort', abortFromExternalSignal);
      globalThis.clearTimeout(timeout);
    }
  }
}

