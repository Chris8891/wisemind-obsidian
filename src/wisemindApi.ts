import {openWiseMindConnectionDialog} from './services/connectionDialog';
import {translate} from './i18n';
import type {
  WiseMindFolder,
  WiseMindLanguageSetting,
  WiseMindSnapshot,
  WiseMindWorkspaceState,
} from './types';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type AssistantStreamEvent = {
  type?: 'delta' | 'final' | 'error' | 'done';
  text?: string;
  data?: unknown;
  error?: string;
};

type AssistantStreamCallbacks<T = any> = {
  onDelta?: (text: string) => void;
  onFinal?: (data: T) => void;
  onEvent?: (event: AssistantStreamEvent) => void;
};

export class WiseMindApiError extends Error {
  status?: number;
  details?: WiseMindApiRequestDebug;

  constructor(message: string, status?: number, details?: WiseMindApiRequestDebug) {
    super(message);
    this.name = 'WiseMindApiError';
    this.status = status;
    this.details = details;
  }
}

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

export class WiseMindApiClient {
  private baseUrl: string;
  private fetchImpl: FetchLike;
  private timeoutMs: number;
  private language: () => WiseMindLanguageSetting | undefined;

  constructor(
    baseUrl: string,
    fetchImpl: FetchLike = fetch.bind(globalThis),
    timeoutMs = 10000,
    language: () => WiseMindLanguageSetting | undefined = () => undefined,
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.language = language;
  }

  private t(key: string, params?: Record<string, unknown>) {
    return translate(this.language(), key, params);
  }

  async health() {
    return this.request('/api/v2/health');
  }

  async getWorkspaceState() {
    return this.getData<WiseMindWorkspaceState>('/api/v2/workspace/state');
  }

  async search(q: string, types?: string[]) {
    const params = new URLSearchParams({q});
    if (types?.length) params.set('types', types.join(','));
    return this.request(`/api/search?${params.toString()}`);
  }

  async openSource(payload: Record<string, unknown>) {
    return this.postData('/api/v2/open-source', payload);
  }

  async getAssistantActions() {
    return this.getData<any>('/api/v2/assistant/actions');
  }

  async listAssistantPrompts(scene = 'documentSummary') {
    return this.getData<{
      scene: string;
      options: Array<{key: string; name: string; order?: number; icon?: string}>;
      defaultPromptKey?: string;
    }>(`/api/v2/assistant/prompts${toQuery({scene})}`);
  }

  async summarizeContent(payload: Record<string, unknown>, options: {signal?: AbortSignal} = {}) {
    return this.postData('/api/v2/assistant/summarize', payload, {timeoutMs: 120000, signal: options.signal});
  }

  async summarizeContentStream(
    payload: Record<string, unknown>,
    callbacks: AssistantStreamCallbacks = {},
    options: {signal?: AbortSignal} = {},
  ) {
    return this.postStream('/api/v2/assistant/summarize/stream', payload, callbacks, {
      timeoutMs: 300000,
      signal: options.signal,
    });
  }

  async generateCards(payload: Record<string, unknown>, options: {signal?: AbortSignal} = {}) {
    return this.postData('/api/v2/assistant/generate-cards', payload, {timeoutMs: 120000, signal: options.signal});
  }

  async generateCardsStream(
    payload: Record<string, unknown>,
    callbacks: AssistantStreamCallbacks = {},
    options: {signal?: AbortSignal} = {},
  ) {
    return this.postStream('/api/v2/assistant/generate-cards/stream', payload, callbacks, {
      timeoutMs: 300000,
      signal: options.signal,
    });
  }

  async chat(payload: Record<string, unknown>, options: {signal?: AbortSignal} = {}) {
    return this.postData('/api/v2/assistant/chat', payload, {timeoutMs: 120000, signal: options.signal});
  }

  async chatStream(
    payload: Record<string, unknown>,
    callbacks: AssistantStreamCallbacks = {},
    options: {signal?: AbortSignal} = {},
  ) {
    return this.postStream('/api/v2/assistant/chat/stream', payload, callbacks, {
      timeoutMs: 300000,
      signal: options.signal,
    });
  }

  async rewriteText(
    payload: {
      text: string;
      action: 'rewrite' | 'expand' | 'shorten' | 'polish' | 'tags';
      language?: string;
    },
    options: {signal?: AbortSignal} = {},
  ) {
    return this.postData('/api/v2/assistant/rewrite', payload, {
      timeoutMs: 120000,
      signal: options.signal,
    });
  }

  async getAssistantModel(options: {signal?: AbortSignal} = {}) {
    return this.getData<{model: string}>('/api/v2/assistant/model', {signal: options.signal});
  }

  async listNotes(params: Record<string, string | number | boolean | undefined> = {}) {
    return this.getData<any[]>(`/api/v2/notes${toQuery(params)}`);
  }

  async getNote(id: number | string) {
    return this.getData<any>(`/api/v2/notes/${encodeURIComponent(String(id))}`);
  }

  async listNoteFolders() {
    return this.getData<WiseMindFolder[]>('/api/v2/note-folders');
  }

  async resolveNoteFolder(name: string, fromFolder?: string | number | null) {
    return this.postData('/api/v2/note-folders/resolve', {
      name,
      from_folder: normalizeNullable(fromFolder),
    });
  }

  async createNote(payload: Record<string, unknown>) {
    return this.request('/api/v2/notes', {method: 'POST', body: JSON.stringify(payload)});
  }

  async updateNote(id: number | string, payload: Record<string, unknown>) {
    return this.request(`/api/v2/notes/${encodeURIComponent(String(id))}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async listDocuments(params: Record<string, string | number | boolean | undefined> = {}) {
    return this.getData<any[]>(`/api/v2/files${toQuery(params)}`);
  }

  async getDocument(id: number | string) {
    return this.getData<any>(`/api/v2/files/${encodeURIComponent(String(id))}`);
  }

  async listFileFolders() {
    return this.getData<WiseMindFolder[]>('/api/v2/file-folders');
  }

  async resolveFileFolder(name: string, fromFolder?: string | number | null) {
    return this.postData('/api/v2/file-folders/resolve', {
      name,
      from_folder: normalizeNullable(fromFolder),
    });
  }

  async createDocument(payload: Record<string, unknown>) {
    return this.request('/api/v2/files', {method: 'POST', body: JSON.stringify(payload)});
  }

  async updateDocument(id: number | string, payload: Record<string, unknown>) {
    return this.request(`/api/v2/files/${encodeURIComponent(String(id))}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async upsertDocument(payload: Record<string, unknown>) {
    return this.postData('/api/v2/files/upsert', payload);
  }

  async listKnowledgeBases(params: Record<string, string | number | boolean | undefined> = {}) {
    return this.getData<any[]>(`/api/v2/knowledge-bases${toQuery(params)}`);
  }

  async resolveKnowledgeBase(name: string, extra: Record<string, unknown> = {}) {
    return this.postData('/api/v2/knowledge-bases/resolve', {name, ...extra});
  }

  async listKnowledgeDocuments(knowledgeBaseId?: number | string, q?: string, limit?: number) {
    return this.getData<any[]>(
      `/api/v2/knowledge-documents${toQuery({knowledgeBaseId, q, limit})}`,
    );
  }

  async getKnowledgeDocument(id: number | string) {
    return this.getData<any>(`/api/v2/knowledge-documents/${encodeURIComponent(String(id))}`);
  }

  async createKnowledgeDocument(payload: Record<string, unknown>) {
    return this.request('/api/v2/knowledge-documents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateKnowledgeDocument(id: number | string, payload: Record<string, unknown>) {
    return this.request(`/api/v2/knowledge-documents/${encodeURIComponent(String(id))}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async listCardDecks() {
    return this.getData<any[]>('/api/v2/card-decks');
  }

  async createCardDeck(title: string) {
    return this.postData('/api/v2/card-decks', {title});
  }

  async resolveCardDeck(title: string) {
    return this.postData('/api/v2/card-decks/resolve', {title});
  }

  async listCardFolders(deckId?: number | string) {
    return this.getData<any[]>(`/api/v2/card-folders${toQuery({deckId})}`);
  }

  async createCardFolder(title: string, deckId: number | string) {
    return this.postData('/api/v2/card-folders', {title, deckId});
  }

  async resolveCardFolder(name: string, deckId: number | string) {
    return this.postData('/api/v2/card-folders/resolve', {title: name, deckId});
  }

  async createCardsBatch(payload: Record<string, unknown>) {
    return this.postData('/api/v2/cards/batch', payload);
  }

  async loadSnapshot(): Promise<WiseMindSnapshot> {
    const [notes, noteFolders, documents, documentFolders, knowledgeBases] = await Promise.all([
      this.listNotes({includeFolders: true}),
      this.listNoteFolders(),
      this.listDocuments({includeFolders: true, limit: 200}),
      this.listFileFolders(),
      this.listKnowledgeBases(),
    ]);

    const knowledgeDocumentsNested = await Promise.all(
      knowledgeBases.map((base: any) =>
        this.listKnowledgeDocuments(base.id, undefined, 5000).catch(() => []),
      ),
    );

    return {
      notes,
      noteFolders,
      documents,
      documentFolders,
      knowledgeBases,
      knowledgeDocuments: knowledgeDocumentsNested.flat(),
    };
  }

  private async getData<T>(path: string, options: {signal?: AbortSignal} = {}): Promise<T> {
    const response = await this.request(path, {}, {signal: options.signal});
    return (response?.data ?? []) as T;
  }

  private async postData<T = any>(
    path: string,
    body: Record<string, unknown>,
    options: {timeoutMs?: number; signal?: AbortSignal} = {},
  ): Promise<T> {
    const response = await this.request(
      path,
      {method: 'POST', body: JSON.stringify(body)},
      {timeoutMs: options.timeoutMs, requestBody: body, signal: options.signal},
    );
    return (response?.data ?? response) as T;
  }

  private async postStream<T = any>(
    path: string,
    body: Record<string, unknown>,
    callbacks: AssistantStreamCallbacks<T>,
    options: {timeoutMs?: number; signal?: AbortSignal} = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || this.timeoutMs;
    const method = 'POST';
    const url = `${this.baseUrl}${path}`;
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
        throw new WiseMindApiError(
          parsed?.error || parsed?.message || this.t('apiErrors.requestFailed', {status: response.status}),
          response.status,
          {...baseDebug, status: response.status, responseBody: parsed},
        );
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
      if (error?.name === 'AbortError') {
        if (!options.signal?.aborted) openWiseMindConnectionDialog();
        throw new WiseMindApiError(options.signal?.aborted
          ? this.t('apiErrors.aborted')
          : this.t('apiErrors.timeout', {seconds: Math.round(timeoutMs / 1000)}), undefined, {
          ...baseDebug,
          error: options.signal?.aborted ? 'aborted' : 'timeout',
        });
      }
      if (error instanceof WiseMindApiError) {
        throw error;
      }
      openWiseMindConnectionDialog();
      throw new WiseMindApiError(error?.message || this.t('apiErrors.connectFailed'), undefined, {
        ...baseDebug,
        error: error?.message || 'network error',
      });
    } finally {
      options.signal?.removeEventListener('abort', abortFromExternalSignal);
      globalThis.clearTimeout(timeout);
    }
  }

  private async request(
    path: string,
    init: RequestInit = {},
    options: {timeoutMs?: number; requestBody?: unknown; signal?: AbortSignal} = {},
  ) {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || this.timeoutMs;
    const method = init.method || 'GET';
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

      if (!response.ok) {
        throw new WiseMindApiError(
          json?.error || json?.message || this.t('apiErrors.requestFailed', {status: response.status}),
          response.status,
          {
            ...baseDebug,
            status: response.status,
            responseBody: json,
          },
        );
      }

      return json;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        if (!options.signal?.aborted) openWiseMindConnectionDialog();
        throw new WiseMindApiError(options.signal?.aborted
          ? this.t('apiErrors.aborted')
          : this.t('apiErrors.timeout', {seconds: Math.round(timeoutMs / 1000)}), undefined, {
          ...baseDebug,
          error: options.signal?.aborted ? 'aborted' : 'timeout',
        });
      }
      if (error instanceof WiseMindApiError) {
        throw error;
      }
      openWiseMindConnectionDialog();
      throw new WiseMindApiError(error?.message || this.t('apiErrors.connectFailed'), undefined, {
        ...baseDebug,
        error: error?.message || 'network error',
      });
    } finally {
      options.signal?.removeEventListener('abort', abortFromExternalSignal);
      globalThis.clearTimeout(timeout);
    }
  }
}

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

const normalizeNullable = (value?: string | number | null) => {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
};

const parseStreamLine = (line: string): AssistantStreamEvent | null => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as AssistantStreamEvent;
  } catch {
    return null;
  }
};

const sanitizeRequestBody = (value: unknown) => {
  if (!value || typeof value !== 'object') return value;
  const body = {...value as Record<string, unknown>};
  if (typeof body.content === 'string') {
    body.contentLength = body.content.length;
    body.contentPreview = body.content.slice(0, 300);
    delete body.content;
  }
  return body;
};
