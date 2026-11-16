import {shell} from 'electron';
import {Platform} from 'obsidian';

import {WiseMindApiError} from './apiErrors';
import {type AssistantStreamCallbacks, WiseMindHttpClient} from './apiTransport';
import {buildWiseMindDeepLink, normalizeNullable, toQuery} from './apiUtils';
import type {
  AssistantTaskPlan,
  CardReviewGrade,
  FileUpsertPayload,
  FileUpsertResult,
  ReviewDueResult,
  TranscriptionDetail,
  TranscriptionMembershipQuota,
  TranscriptionOrganizeResult,
  TranscriptionRecord,
  TranscriptionSegmentUpdate,
  TranscriptionStartOptions,
  WiseMindAccountUsage,
  WiseMindCapabilities,
  WiseMindCardSummary,
  WiseMindFolder,
  WiseMindSnapshot,
  WiseMindWorkspaceState,
} from './types';

export {
  isAbortError,
  isAiNotConfiguredError,
  isMembershipLimitError,
  WiseMindApiError,
  type WiseMindApiErrorCode,
  type WiseMindApiRequestDebug,
} from './apiErrors';
export {buildWiseMindDeepLink, normalizeBaseUrl, toQuery} from './apiUtils';

export type WiseMindHealth = {
  ok?: boolean;
  service?: string;
  version?: string;
  appVersion?: string;
  /** Answered only by the pre-v2 `/api/health` route, i.e. a desktop app older than 2.0. */
  legacy?: boolean;
};

export type KnowledgeDocumentCreateResponse = {
  ok?: boolean;
  id?: number | null;
  created?: boolean;
  skipped?: boolean;
  message?: string;
};

const CAPABILITIES_TTL_MS = 60 * 1000;
const SYNC_TIMEOUT_MS = 60 * 1000;

export class WiseMindApiClient extends WiseMindHttpClient {
  private capabilitiesCache: {at: number; value: WiseMindCapabilities} | null = null;
  private capabilitiesRequest: Promise<WiseMindCapabilities> | null = null;

  async health(): Promise<WiseMindHealth> {
    try {
      return await this.request('/api/v2/health');
    } catch (error) {
      if (!(error instanceof WiseMindApiError) || error.code !== 'NOT_FOUND') throw error;
      const legacy = (await this.request('/api/health')) as WiseMindHealth;
      return {...legacy, legacy: true};
    }
  }

  /** Cached for a minute; concurrent callers share one request. Old clients without the endpoint resolve to {}. */
  async getCapabilities(options: {force?: boolean} = {}): Promise<WiseMindCapabilities> {
    const cache = this.capabilitiesCache;
    if (!options.force && cache && Date.now() - cache.at < CAPABILITIES_TTL_MS) return cache.value;
    if (this.capabilitiesRequest) return this.capabilitiesRequest;
    const request = this.request('/api/capabilities', {}, {showConnectionDialog: false})
      .then(response => {
        const value = ((response as {data?: WiseMindCapabilities})?.data || {}) as WiseMindCapabilities;
        this.capabilitiesCache = {at: Date.now(), value};
        return value;
      })
      .catch(error => {
        if (error instanceof WiseMindApiError && (error.code === 'NOT_FOUND' || error.code === 'UNSUPPORTED')) {
          const value: WiseMindCapabilities = {features: []};
          this.capabilitiesCache = {at: Date.now(), value};
          return value;
        }
        throw error;
      })
      .finally(() => {
        this.capabilitiesRequest = null;
      });
    this.capabilitiesRequest = request;
    return request;
  }

  clearCapabilitiesCache() {
    this.capabilitiesCache = null;
  }

  async getWorkspaceState() {
    return this.getData<WiseMindWorkspaceState>('/api/v2/workspace/state', {showConnectionDialog: false});
  }

  async getAccountUsage() {
    return this.getData<WiseMindAccountUsage>('/api/v2/account/usage', {showConnectionDialog: false});
  }

  async search(q: string, types?: string[], options: {mode?: 'semantic' | 'keyword'; limit?: number; signal?: AbortSignal} = {}) {
    const params = new URLSearchParams({q});
    if (types?.length) params.set('types', types.join(','));
    if (options.mode) params.set('mode', options.mode);
    if (options.limit) params.set('limit', String(options.limit));
    return this.request(`/api/search?${params.toString()}`, {}, {signal: options.signal, showConnectionDialog: false});
  }

  async upsertFile(payload: FileUpsertPayload, options: {signal?: AbortSignal} = {}) {
    return this.postData<FileUpsertResult>('/api/v2/files/upsert', payload, {
      timeoutMs: SYNC_TIMEOUT_MS,
      signal: options.signal,
      showConnectionDialog: false,
    });
  }

  /**
   * Updates a synced file by id. Upserting again would not find it: inside a learning space the desktop
   * copies the note and stores the copy's path, so a lookup by the vault path creates a duplicate.
   */
  async updateSyncedFile(id: number, payload: Omit<FileUpsertPayload, 'knowledgeBaseIds'>, options: {signal?: AbortSignal} = {}) {
    await this.request(
      `/api/v2/files/${encodeURIComponent(String(id))}`,
      {method: 'PATCH', body: JSON.stringify(payload)},
      {timeoutMs: SYNC_TIMEOUT_MS, requestBody: payload, signal: options.signal, showConnectionDialog: false},
    );
  }

  /** Adds an existing file to a topic; topics that skip duplicates answer `skipped` instead of a second copy. */
  async addFileToTopic(
    payload: {knowledgeBaseId: number; sourceId: number; title: string; fileUrl: string; size?: number},
    options: {signal?: AbortSignal} = {},
  ): Promise<KnowledgeDocumentCreateResponse> {
    const body = {...payload, type: 'file', fileType: 'md', fileExt: 'md'};
    return this.request(
      '/api/v2/knowledge-documents',
      {method: 'POST', body: JSON.stringify(body)},
      {timeoutMs: SYNC_TIMEOUT_MS, requestBody: body, signal: options.signal, showConnectionDialog: false},
    );
  }

  async getFile(id: number | string, options: {signal?: AbortSignal} = {}) {
    return this.getData<Record<string, any> | null>(`/api/v2/files/${encodeURIComponent(String(id))}`, {
      signal: options.signal,
      showConnectionDialog: false,
    });
  }

  async planAssistantTask(
    payload: {instruction: string; notes: Array<{path: string; title: string; content?: string}>},
    options: {signal?: AbortSignal} = {},
  ) {
    return this.postData<AssistantTaskPlan>('/api/v2/assistant/tasks/plan', payload, {
      timeoutMs: 120000,
      signal: options.signal,
    });
  }

  async createQuiz(payload: {content?: string; fileId?: number | string; title?: string}, options: {signal?: AbortSignal} = {}) {
    return this.postData<{paperId: number | string}>('/api/v2/assistant/quiz', payload, {
      timeoutMs: 180000,
      signal: options.signal,
    });
  }

  /** Opens a desktop settings page, e.g. `model` for connecting an AI model. */
  async openClientSetting(settingType: string) {
    return this.openSource({type: 'setting', settingType});
  }

  async openSource(payload: Record<string, unknown>) {
    try {
      return await this.postData('/api/v2/open-source', payload, {
        timeoutMs: 1200,
        showConnectionDialog: false,
      });
    } catch (requestError) {
      if (Platform.isMacOS) {
        try {
          const openError = await shell.openPath('/Applications/WiseMindAI.app');
          if (openError) throw new Error(openError);
          const openedFromApp = await this.waitForOpenSource(payload, 16);
          if (openedFromApp) return openedFromApp;
        } catch {
          // Fall through to the registered protocol for non-standard installations.
        }
      }

      let deepLinkOpened = false;
      try {
        await shell.openExternal(buildWiseMindDeepLink(payload));
        deepLinkOpened = true;
      } catch {
        // macOS can still launch the installed app directly below.
      }
      const reopened = await this.waitForOpenSource(payload, 5);
      if (reopened) return reopened;
      if (deepLinkOpened) {
        return {ok: true, launched: true};
      }
      throw requestError;
    }
  }

  private async waitForOpenSource(payload: Record<string, unknown>, attempts: number) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await new Promise(resolve => globalThis.setTimeout(resolve, 500));
      try {
        return await this.postData('/api/v2/open-source', payload, {
          timeoutMs: 800,
          showConnectionDialog: false,
        });
      } catch {
        // The desktop client is still starting. Retry within the short bounded window.
      }
    }
    return null;
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
      action: 'rewrite' | 'expand' | 'shorten' | 'polish' | 'tags' | 'translate';
      language?: string;
      instruction?: string;
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

  async createKnowledgeDocument(
    payload: Record<string, unknown>,
  ): Promise<KnowledgeDocumentCreateResponse> {
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

  async listCardsBySource(sourcePath: string, limit = 200) {
    return this.getData<WiseMindCardSummary[]>(`/api/v2/cards${toQuery({sourcePath, limit})}`, {
      showConnectionDialog: false,
    });
  }

  async getDueCards(params: {deckId?: number; sourcePath?: string; includeNew?: boolean; limit?: number} = {}) {
    return this.getData<ReviewDueResult>(`/api/v2/card-review/due${toQuery(params)}`, {
      showConnectionDialog: false,
    });
  }

  async submitCardReview(payload: {
    duration: number;
    items: Array<{cardId: number; grade: CardReviewGrade; duration?: number}>;
  }) {
    return this.postData<{recordIds: number[]; acceptedCount: number}>(
      '/api/v2/card-review/sessions',
      payload,
    );
  }

  async renameCardSourcePath(from: string, to: string, prefix = false) {
    return this.postData<{affected: number}>(
      '/api/v2/cards/source-path/rename',
      {from, to, prefix},
      {showConnectionDialog: false},
    );
  }

  async getTranscriptionStartOptions() {
    return this.getData<TranscriptionStartOptions>('/api/v2/transcriptions/start-options', {
      showConnectionDialog: false,
    });
  }

  async getTranscriptionMembership(recordId?: string) {
    return this.getData<TranscriptionMembershipQuota>(
      `/api/v2/transcriptions/membership${toQuery({recordId})}`,
    );
  }

  async listTranscriptions(page = 1, pageSize = 20) {
    return this.getData<{
      items: TranscriptionRecord[];
      page: number;
      pageSize: number;
      total: number;
      hasMore: boolean;
    }>(`/api/v2/transcriptions${toQuery({page, pageSize})}`);
  }

  async getTranscriptionDetail(recordId: string) {
    return this.getData<TranscriptionDetail>(
      `/api/v2/transcriptions/${encodeURIComponent(recordId)}`,
    );
  }

  async organizeTranscription(recordId: string) {
    return this.postData<{
      record: TranscriptionRecord;
      result: TranscriptionOrganizeResult;
    }>(`/api/v2/transcriptions/${encodeURIComponent(recordId)}/organize`, {}, {timeoutMs: 120000});
  }

  async updateTranscriptionOrganization(
    recordId: string,
    result: TranscriptionOrganizeResult,
  ) {
    return this.postData<{
      record: TranscriptionRecord;
      result: TranscriptionOrganizeResult;
    }>(`/api/v2/transcriptions/${encodeURIComponent(recordId)}/organization`, result, {
      timeoutMs: 120000,
    });
  }

  async updateTranscriptionSegments(recordId: string, updates: TranscriptionSegmentUpdate[]) {
    return this.postData<TranscriptionDetail>(
      `/api/v2/transcriptions/${encodeURIComponent(recordId)}/segments`,
      {updates},
    );
  }

  async openTranscriptions(recordId?: string) {
    return this.openSource({type: 'transcription', ...(recordId ? {id: recordId} : {})});
  }

  async loadSnapshot(options?: {
    includeKnowledgeDocuments?: boolean;
    /** Destination pickers only need folders / topics. */
    destinationsOnly?: boolean;
  }): Promise<WiseMindSnapshot> {
    const destinationsOnly = Boolean(options?.destinationsOnly);
    const includeKnowledgeDocuments =
      !destinationsOnly && options?.includeKnowledgeDocuments !== false;

    if (destinationsOnly) {
      const [noteFolders, documentFolders, knowledgeBases] = await Promise.all([
        this.listNoteFolders(),
        this.listFileFolders(),
        this.listKnowledgeBases(),
      ]);
      return {
        notes: [],
        noteFolders,
        documents: [],
        documentFolders,
        knowledgeBases,
        knowledgeDocuments: [],
      };
    }

    const [notes, noteFolders, documents, documentFolders, knowledgeBases] = await Promise.all([
      this.listNotes({includeFolders: true}),
      this.listNoteFolders(),
      this.listDocuments({includeFolders: true, limit: 200}),
      this.listFileFolders(),
      this.listKnowledgeBases(),
    ]);

    const knowledgeDocuments = includeKnowledgeDocuments
      ? (
          await Promise.all(
            knowledgeBases.map((base: any) =>
              this.listKnowledgeDocuments(base.id, undefined, 5000).catch(() => []),
            ),
          )
        ).flat()
      : [];

    return {
      notes,
      noteFolders,
      documents,
      documentFolders,
      knowledgeBases,
      knowledgeDocuments,
    };
  }
}
