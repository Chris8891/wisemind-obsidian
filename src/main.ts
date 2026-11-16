import { addIcon, Notice, Plugin, setIcon, type TFile } from 'obsidian';

import { SelectionToolbar } from './editor/selectionToolbar';
import { SlashCommandSuggest } from './editor/slashCommands';
import { AiTaskModal } from './modals/aiTaskModal';
import { WiseMindSearchModal } from './modals/searchModal';
import { registerCommands } from './plugin/commands';
import { askAboutSelection, runEditorRewriteAction } from './plugin/editorActions';
import { registerMenus } from './plugin/menus';
import { createQuizFromNote } from './plugin/quizActions';
import { Reminders } from './plugin/reminders';
import { registerRenameTracker } from './plugin/renameTracker';
import { SendActions } from './plugin/sendActions';
import { assistantActionLabels } from './services/assistantService';
import { applyCapabilities, capabilityState, markAiNotReady } from './services/capabilities';
import type { EditorRewriteAction } from './services/editorRewriteActions';
import {
  openChatWithMessage,
  openPanelTab,
  panelState,
  queueAssistantAction,
  setConnected,
  setDueCount,
} from './services/panelStore';
import {TranscriptionController} from './services/transcriptionController';
import { SyncEngine } from './sync/syncEngine';
import { registerSyncWatcher } from './sync/syncWatcher';
import { WiseMindObsidianView } from './view/WiseMindObsidianView';
import {
  type AssistantActionKind,
  buildAssistantActionPlan,
  buildMultiNoteAssistantActionPlan,
} from './assistantActions';
import { WISEMIND_ICON_ID, WISEMIND_OBSIDIAN_ICON, WISEMIND_VIEW_TYPE } from './constants';
import { CLIENT_SETTING_PAGES } from './features';
import { setI18nLocale, translate } from './i18n';
import {
  DEFAULT_SETTINGS,
  normalizeWiseMindSettings,
  WiseMindSettingTab,
} from './settings';
import { WiseMindStatusBar } from './statusBar';
import type { WiseMindImportSettings } from './types';
import { readObsidianFile } from './vaultScanner';
import { WiseMindApiClient } from './wisemindApi';

import './styles.scss';
import './styles/v2.scss';
import './styles/pages/shared.scss';
import './styles/pages/summary.scss';
import './styles/pages/cards.scss';
import './styles/pages/chat.scss';
import './styles/pages/sync.scss';
import './styles/pages/transcription.scss';
import './styles/pages/assistant.scss';
import './styles/pages/review.scss';

const DUE_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const RECONNECT_THROTTLE_MS = 15 * 1000;
const DUE_STALE_ON_FOCUS_MS = 10 * 60 * 1000;
const OFFLINE_RETRY_INTERVAL_MS = 60 * 1000;
const MULTI_NOTE_LIMIT = 20;

export default class WiseMindObsidianPlugin extends Plugin {
  settings: WiseMindImportSettings = DEFAULT_SETTINGS;
  api: WiseMindApiClient = new WiseMindApiClient(DEFAULT_SETTINGS.apiBaseUrl);
  statusBar!: WiseMindStatusBar;
  reminders!: Reminders;
  transcription!: TranscriptionController;
  syncEngine!: SyncEngine;
  sendActions = new SendActions(this);
  private renameTracker: {flush: () => Promise<void>} | null = null;
  private connectionCheck: Promise<boolean> | null = null;
  private connectionCheckApi: WiseMindApiClient | null = null;
  private apiClientUrl = '';
  private lastConnectionCheckAt = 0;
  private lastDueRefreshAt = 0;
  private unloaded = false;
  private healthAppVersion = '';

  get connected() {
    return panelState.connected;
  }

  async onload() {
    this.settings = normalizeWiseMindSettings((await this.loadData()) as Partial<WiseMindImportSettings> | null);
    setI18nLocale(this.settings.assistantDefaults.language);
    this.api = this.createApiClient();
    this.syncEngine = new SyncEngine(this);

    addIcon(WISEMIND_ICON_ID, WISEMIND_OBSIDIAN_ICON);
    this.addSettingTab(new WiseMindSettingTab(this.app, this));
    this.registerView(WISEMIND_VIEW_TYPE, leaf => new WiseMindObsidianView(leaf, this));
    this.statusBar = new WiseMindStatusBar(
      this.addStatusBarItem(),
      () => void this.onStatusBarClick(),
      () => this.settings.assistantDefaults.language,
    );
    this.transcription = new TranscriptionController(this, state => {
      if (['recording', 'paused', 'starting', 'stopping'].includes(state.status)) {
        this.statusBar?.setTranscribing(state.elapsedMs, state.status === 'paused');
      } else if (state.status === 'error') {
        this.statusBar?.setDisconnected();
      } else {
        this.statusBar?.setConnected();
      }
    });

    const ribbonIcon = this.addRibbonIcon(WISEMIND_ICON_ID, 'WiseMindAI', () => void this.activateView());
    if (!ribbonIcon.querySelector('svg')) setIcon(ribbonIcon, WISEMIND_ICON_ID);

    registerCommands(this);
    registerMenus(this);
    this.renameTracker = registerRenameTracker(this);
    this.reminders = new Reminders(this);
    this.reminders.register();
    new SelectionToolbar(this).register();
    this.registerEditorSuggest(new SlashCommandSuggest(this));

    // Network checks and the sync watcher wait for the layout so they never delay Obsidian startup;
    // no vault scan happens here, the sync tab or an auto rule triggers it later.
    this.app.workspace.onLayoutReady(() => {
      registerSyncWatcher(this);
      void this.testConnection();
    });
    this.registerInterval(window.setInterval(() => void this.refreshDueCount(), DUE_REFRESH_INTERVAL_MS));
    this.registerInterval(window.setInterval(() => this.retryWhileOffline(), OFFLINE_RETRY_INTERVAL_MS));
    // The desktop app is often started after Obsidian, so recover quietly when the window regains focus.
    this.registerDomEvent(window, 'focus', () => this.onWindowFocus());
  }

  /** A cheap local health check so the panel recovers without the user clicking retry. */
  private retryWhileOffline() {
    if (!panelState.connected && document.visibilityState === 'visible') void this.reconnectIfStale();
  }

  private onWindowFocus() {
    if (!panelState.connected) void this.reconnectIfStale();
    else if (Date.now() - this.lastDueRefreshAt > DUE_STALE_ON_FOCUS_MS) void this.refreshDueCount();
  }

  /** Re-checks the connection at most once per throttle window. */
  reconnectIfStale() {
    if (panelState.connected || Date.now() - this.lastConnectionCheckAt < RECONNECT_THROTTLE_MS) {
      return Promise.resolve(panelState.connected);
    }
    return this.testConnection();
  }

  async onunload() {
    this.unloaded = true;
    await this.syncEngine?.dispose();
    await this.transcription?.dispose();
  }

  t(key: string, params?: Record<string, unknown>) {
    return translate(this.settings.assistantDefaults.language, key, params);
  }

  private createApiClient() {
    this.apiClientUrl = this.settings.apiBaseUrl;
    const api = new WiseMindApiClient(
      this.settings.apiBaseUrl,
      fetch.bind(globalThis),
      10000,
      () => this.settings.assistantDefaults.language,
      () => this.settings.workspaceId || undefined,
    );
    // The model can be removed after capabilities were cached; the next AI call then shows the banner.
    api.onErrorCode = code => {
      if (code !== 'AI_NOT_CONFIGURED') return;
      api.clearCapabilitiesCache();
      markAiNotReady();
    };
    return api;
  }

  async saveSettings() {
    // Settings are saved often (history, reminders); only an address change needs a new client.
    if (this.settings.apiBaseUrl !== this.apiClientUrl) {
      this.api = this.createApiClient();
      void this.testConnection();
    }
    setI18nLocale(this.settings.assistantDefaults.language);
    await this.saveData(this.settings);
  }

  async markTutorialSeen() {
    if (this.settings.hasSeenTutorial) return;
    this.settings.hasSeenTutorial = true;
    await this.saveSettings();
  }

  /** Concurrent callers share one health request; going online also catches up on queued work. */
  testConnection(): Promise<boolean> {
    // A check started before the API address changed would report on the old address.
    if (!this.connectionCheck || this.connectionCheckApi !== this.api) {
      const api = this.api;
      const check = this.checkConnection(api).finally(() => {
        if (this.connectionCheck === check) this.connectionCheck = null;
      });
      this.connectionCheck = check;
      this.connectionCheckApi = api;
    }
    return this.connectionCheck;
  }

  private async checkConnection(api: WiseMindApiClient): Promise<boolean> {
    const wasConnected = panelState.connected;
    this.lastConnectionCheckAt = Date.now();
    let ok = false;
    try {
      this.healthAppVersion = (await api.health()).appVersion || '';
      ok = true;
    } catch {
      ok = false;
    }
    if (this.unloaded) return ok;
    if (api !== this.api) return this.testConnection();
    setConnected(ok);
    if (!this.transcription?.isActive) {
      if (ok) this.statusBar?.setConnected();
      else this.statusBar?.setDisconnected();
    }
    if (ok) void this.refreshCapabilities(!wasConnected);
    else applyCapabilities(null);
    if (ok && !wasConnected) {
      void this.refreshDueCount();
      void this.renameTracker?.flush();
      void this.syncEngine?.flushQueued();
    }
    return ok;
  }

  /** Reads aiReady / features from the client; failures keep the previous state. */
  async refreshCapabilities(force = false) {
    try {
      const capabilities = await this.api.getCapabilities({ force });
      // Clients before 2.0 report their version only in /health, which the outdated banner needs.
      applyCapabilities({ ...capabilities, appVersion: capabilities.appVersion || this.healthAppVersion });
    } catch {
      // Keep whatever was known; the next health check retries.
    }
    return capabilityState;
  }

  /** Opens WiseMindAI settings > AI model so the user can connect a model. */
  async openAiSettings() {
    try {
      await this.api.openClientSetting(CLIENT_SETTING_PAGES.model);
    } catch (error) {
      new Notice((error as Error)?.message || this.t('capability.openClientFailed'));
    }
  }

  /** AI entry points call this first; when no model is connected it points the user to WiseMindAI instead. */
  async ensureAiReady() {
    if (capabilityState.aiReady) return true;
    await this.refreshCapabilities(true);
    if (capabilityState.aiReady) return true;
    this.reminders.notify(this.t('capability.aiNotReadyNotice'), this.t('capability.connectAi'), () => void this.openAiSettings());
    return false;
  }

  /** Excluded folders and private notes never go to AI either. */
  isFileExcluded(file: TFile | null | undefined) {
    if (!file || file.extension !== 'md') return false;
    return this.syncEngine.isExcluded(file);
  }

  private blockExcluded(file: TFile | null | undefined) {
    if (!this.isFileExcluded(file)) return false;
    new Notice(this.t('capability.privateBlocked'));
    return true;
  }

  async createQuiz(file?: TFile | null, selectedText = '') {
    const target = file ?? this.app.workspace.getActiveFile();
    if (this.blockExcluded(target) || !(await this.ensureAiReady())) return;
    await createQuizFromNote(this, target, selectedText);
  }

  async openAiTask(files?: TFile[], instruction = '') {
    if (!(await this.ensureAiReady())) return;
    const notes = (files?.length ? files : [this.app.workspace.getActiveFile()].filter((f): f is TFile => Boolean(f)))
      .filter(file => file.extension === 'md' && !this.isFileExcluded(file));
    new AiTaskModal(this, notes, instruction).open();
  }

  async refreshDueCount() {
    if (!panelState.connected) return;
    this.lastDueRefreshAt = Date.now();
    try {
      const review = this.settings.review;
      const result = await this.api.getDueCards({includeNew: review.includeNew, limit: 1});
      const count = result.summary.due + (review.includeNew ? result.summary.new : 0);
      setDueCount(count);
      this.statusBar?.setDueCount(count);
      this.reminders?.maybeRemindReview();
    } catch {
      // Older desktop versions have no review endpoint; keep the badge hidden.
      // The failure may also mean the app was closed, so let the health check decide.
      void this.testConnection();
    }
  }

  private async onStatusBarClick() {
    if (this.transcription?.isActive) {
      await this.openTranscriptionPage();
      return;
    }
    if (panelState.dueCount > 0) openPanelTab('review');
    await this.activateView();
  }

  async activateView() {
    void this.reconnectIfStale();
    const existing = this.app.workspace.getLeavesOfType(WISEMIND_VIEW_TYPE)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      new Notice(this.t('common.openPanelFailed'));
      return;
    }
    await leaf.setViewState({ type: WISEMIND_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  async openTranscriptionPage() {
    openPanelTab('transcription');
    await this.activateView();
  }

  openSettings() {
    const setting = (this.app as unknown as {setting?: {open(): void; openTabById(id: string): void}}).setting;
    setting?.open();
    setting?.openTabById(this.manifest.id);
  }

  openSearch(initialQuery = '') {
    new WiseMindSearchModal(this, initialQuery).open();
  }

  async openChat(message: string, autoSend = false, newSession = false) {
    openChatWithMessage(message, autoSend, newSession);
    await this.activateView();
  }

  getActiveEditorSelection() {
    return this.app.workspace.activeEditor?.editor?.getSelection() || '';
  }

  async runAssistantAction(
    kind: AssistantActionKind,
    selectedText = '',
    file?: TFile | null,
    preset?: 'insights',
  ) {
    try {
      const target = file ?? this.app.workspace.getActiveFile();
      if (this.blockExcluded(target) || !(await this.ensureAiReady())) return;
      const currentNote = target && target.extension === 'md' ? await readObsidianFile(this.app, target) : null;
      queueAssistantAction(buildAssistantActionPlan({
        kind,
        currentNote,
        selectedText,
        labels: assistantActionLabels(this),
        preset,
      }));
      await this.activateView();
    } catch (error) {
      new Notice((error as Error)?.message || this.t('obsidianMessages.noProcessableContent'));
    }
  }

  /** Large folders are capped to the most recently edited notes so the prompt stays usable. */
  async runMultiNoteAction(kind: AssistantActionKind, files: TFile[]) {
    try {
      if (!(await this.ensureAiReady())) return;
      const allowed = files.filter(file => !this.isFileExcluded(file));
      if (!allowed.length) {
        new Notice(this.t('capability.privateBlocked'));
        return;
      }
      const picked = allowed.length > MULTI_NOTE_LIMIT
        ? [...allowed].sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, MULTI_NOTE_LIMIT)
        : allowed;
      if (picked.length < allowed.length) {
        new Notice(this.t('obsidianMessages.multiNoteLimited', {count: picked.length, total: allowed.length}));
      }
      const notes = await Promise.all(picked.map(file => readObsidianFile(this.app, file)));
      queueAssistantAction(buildMultiNoteAssistantActionPlan({ kind, notes, labels: assistantActionLabels(this) }));
      await this.activateView();
    } catch (error) {
      new Notice((error as Error)?.message || this.t('obsidianMessages.noProcessableContent'));
    }
  }

  async runEditorRewriteAction(action: EditorRewriteAction) {
    if (this.blockExcluded(this.app.workspace.getActiveFile()) || !(await this.ensureAiReady())) return;
    return runEditorRewriteAction(this, action);
  }

  async askAboutSelection() {
    if (this.blockExcluded(this.app.workspace.getActiveFile())) return;
    return askAboutSelection(this);
  }

  importRunnerLabels() {
    return {
      defaultKnowledgeBase: this.t('importRunner.defaultKnowledgeBase'),
      note: this.t('importRunner.note'),
      document: this.t('importRunner.document'),
      knowledge: this.t('importRunner.knowledge'),
      rootFolder: this.t('importRunner.rootFolder'),
      noteUpdated: (target: string) => this.t('importRunner.noteUpdated', {target}),
      noteCreated: (target: string) => this.t('importRunner.noteCreated', {target}),
      documentUpdated: (target: string) => this.t('importRunner.documentUpdated', {target}),
      documentCreated: (target: string) => this.t('importRunner.documentCreated', {target}),
      knowledgeDesc: this.t('importRunner.knowledgeDesc'),
      knowledgeUpdated: (target: string) => this.t('importRunner.knowledgeUpdated', {target}),
      knowledgeCreated: (target: string) => this.t('importRunner.knowledgeCreated', {target}),
      knowledgeSkipped: (target: string) => this.t('importRunner.knowledgeSkipped', {target}),
      failed: this.t('importRunner.failed'),
      failedTarget: this.t('importRunner.failedTarget'),
    };
  }
}
