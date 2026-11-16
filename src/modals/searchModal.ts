import {Modal, Notice, setIcon, type TFile} from 'obsidian';

import {FEATURES} from '../features';
import type WiseMindObsidianPlugin from '../main';
import {hasFeature} from '../services/capabilities';
import {
  normalizeWiseMindSearch,
  readSearchMode,
  searchVaultItems,
  type VaultSearchHit,
  type VaultSearchItem,
  type WiseMindSearchHit,
} from '../services/searchResults';

type Mode = 'search' | 'ask';

type ResultEntry =
  | {kind: 'vault'; hit: VaultSearchHit}
  | {kind: 'wisemind'; hit: WiseMindSearchHit};

const VAULT_DELAY_MS = 60;
const REMOTE_DELAY_MS = 260;

/** Unified search: vault titles locally, WiseMindAI content through the local API. */
export class WiseMindSearchModal extends Modal {
  private mode: Mode = 'search';
  private query = '';
  private vaultItems: VaultSearchItem[] = [];
  private vaultHits: VaultSearchHit[] = [];
  private remoteHits: WiseMindSearchHit[] = [];
  private remoteState: 'idle' | 'loading' | 'offline' = 'idle';
  private remoteDegraded = false;
  private selected = 0;
  private requestId = 0;
  private vaultTimer = 0;
  private remoteTimer = 0;
  private inputEl!: HTMLInputElement;
  private modeEls: Partial<Record<Mode, HTMLButtonElement>> = {};
  private resultsEl!: HTMLDivElement;
  private sourcePath = '';

  constructor(private plugin: WiseMindObsidianPlugin, initialQuery = '') {
    super(plugin.app);
    this.query = initialQuery;
  }

  onOpen() {
    this.sourcePath = this.app.workspace.getActiveFile()?.path || '';
    this.vaultItems = this.app.vault.getMarkdownFiles().map(file => ({
      path: file.path,
      title: file.basename,
      folderPath: file.parent?.path || '',
      modifiedAt: file.stat.mtime,
    }));
    this.modalEl.addClass('wm2-modal', 'wm2-search-modal');
    this.titleEl.empty();
    this.contentEl.empty();

    const bar = this.contentEl.createDiv({cls: 'wm2-search-bar'});
    const modes = bar.createDiv({cls: 'wm2-segmented'});
    (['search', 'ask'] as Mode[]).forEach(mode => {
      const button = modes.createEl('button', {
        text: this.plugin.t(mode === 'search' ? 'searchModal.modeSearch' : 'searchModal.modeAsk'),
        attr: {type: 'button'},
      });
      button.addEventListener('click', () => this.setMode(mode));
      this.modeEls[mode] = button;
    });
    this.inputEl = bar.createEl('input', {cls: 'wm2-search-input', attr: {type: 'text', spellcheck: 'false'}});
    this.inputEl.value = this.query;
    this.inputEl.addEventListener('input', () => this.onInput());
    this.inputEl.addEventListener('keydown', event => this.onKeydown(event));

    this.resultsEl = this.contentEl.createDiv({cls: 'wm2-search-results', attr: {role: 'listbox'}});
    const footer = this.contentEl.createDiv({cls: 'wm2-search-footer'});
    ['searchModal.footerSelect', 'searchModal.footerOpen', 'searchModal.footerChat', 'searchModal.footerTab'].forEach(key =>
      footer.createSpan({text: this.plugin.t(key)}),
    );

    this.setMode('search');
    window.setTimeout(() => this.inputEl.focus(), 0);
    if (this.query) this.onInput();
    void this.plugin.reconnectIfStale().then(ok => {
      if (ok && this.resultsEl.isConnected && this.remoteState === 'offline') this.scheduleRemoteSearch();
    });
  }

  onClose() {
    window.clearTimeout(this.vaultTimer);
    window.clearTimeout(this.remoteTimer);
    this.requestId += 1;
    this.contentEl.empty();
  }

  private get entries(): ResultEntry[] {
    if (this.mode === 'ask') return [];
    return [
      ...this.vaultHits.map(hit => ({kind: 'vault' as const, hit})),
      ...this.remoteHits.map(hit => ({kind: 'wisemind' as const, hit})),
    ];
  }

  private setMode(mode: Mode) {
    this.mode = mode;
    (Object.keys(this.modeEls) as Mode[]).forEach(key => this.modeEls[key]?.toggleClass('is-active', key === mode));
    this.inputEl.placeholder = this.plugin.t(mode === 'search' ? 'searchModal.placeholder' : 'searchModal.askPlaceholder');
    this.selected = 0;
    this.render();
    this.inputEl.focus();
  }

  private onInput() {
    this.query = this.inputEl.value;
    this.selected = 0;
    if (this.mode === 'ask') {
      this.render();
      return;
    }
    window.clearTimeout(this.vaultTimer);
    this.vaultTimer = window.setTimeout(() => {
      this.vaultTimer = 0;
      this.vaultHits = searchVaultItems(this.vaultItems, this.query);
      this.render();
    }, VAULT_DELAY_MS);
    this.scheduleRemoteSearch();
  }

  private scheduleRemoteSearch() {
    window.clearTimeout(this.remoteTimer);
    const query = this.query.trim();
    const requestId = ++this.requestId;
    if (!query) {
      this.remoteHits = [];
      this.remoteState = 'idle';
      return;
    }
    // Requests to a stopped desktop app only fail after the API timeout, so skip them while offline.
    if (!this.plugin.connected) {
      this.remoteHits = [];
      this.remoteState = 'offline';
      this.render();
      return;
    }
    this.remoteTimer = window.setTimeout(async () => {
      this.remoteState = 'loading';
      this.render();
      try {
        const types = ['notes', 'files', 'knowledge-documents', 'cards'];
        if (hasFeature(FEATURES.topics)) types.push('knowledge-bases');
        const semantic = hasFeature(FEATURES.semanticSearch);
        const response = await this.plugin.api.search(query, types, semantic ? {mode: 'semantic'} : {});
        if (requestId !== this.requestId) return;
        this.remoteHits = normalizeWiseMindSearch(response);
        this.remoteDegraded = semantic && readSearchMode(response).degraded;
        this.remoteState = 'idle';
      } catch {
        if (requestId !== this.requestId) return;
        this.remoteHits = [];
        this.remoteDegraded = false;
        this.remoteState = 'offline';
      }
      this.render();
    }, REMOTE_DELAY_MS);
  }

  private onKeydown(event: KeyboardEvent) {
    if (event.isComposing) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      this.setMode(this.mode === 'search' ? 'ask' : 'search');
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const count = this.entries.length;
      if (!count) return;
      this.selected = (this.selected + (event.key === 'ArrowDown' ? 1 : count - 1)) % count;
      this.render();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (this.mode === 'ask') {
      this.askLibrary();
      return;
    }
    if (this.vaultTimer) {
      window.clearTimeout(this.vaultTimer);
      this.vaultTimer = 0;
      this.vaultHits = searchVaultItems(this.vaultItems, this.query);
    }
    const entry = this.entries[this.selected];
    if (!entry) return;
    if (event.metaKey || event.ctrlKey) this.addToChat(entry);
    else void this.openEntry(entry);
  }

  private render() {
    if (!this.resultsEl) return;
    this.resultsEl.empty();
    if (this.mode === 'ask') {
      this.resultsEl.createDiv({cls: 'wm2-search-hint', text: this.plugin.t('searchModal.askHint')});
      return;
    }
    if (!this.query.trim()) return;

    const entries = this.entries;
    if (this.vaultHits.length) {
      this.resultsEl.createDiv({cls: 'wm2-search-group', text: this.plugin.t('searchModal.vaultSection')});
      this.vaultHits.forEach((hit, index) => this.renderVaultRow(hit, index));
    }
    if (this.remoteHits.length || this.remoteState !== 'idle') {
      this.resultsEl.createDiv({cls: 'wm2-search-group', text: this.plugin.t('searchModal.wisemindSection')});
      if (this.remoteState === 'loading' && !this.remoteHits.length) {
        this.resultsEl.createDiv({cls: 'wm2-search-hint', text: this.plugin.t('searchModal.loading')});
      } else if (this.remoteState === 'offline') {
        this.resultsEl.createDiv({cls: 'wm2-search-hint', text: this.plugin.t('searchModal.wisemindOffline')});
      } else if (this.remoteDegraded) {
        this.resultsEl.createDiv({cls: 'wm2-search-hint', text: this.plugin.t('searchModal.semanticDegraded')});
      }
      this.remoteHits.forEach((hit, index) => this.renderRemoteRow(hit, this.vaultHits.length + index));
    }
    if (!entries.length && this.remoteState === 'idle') {
      this.resultsEl.createDiv({cls: 'wm2-search-hint', text: this.plugin.t('searchModal.empty')});
    }
    this.resultsEl.querySelector('.is-selected')?.scrollIntoView({block: 'nearest'});
  }

  private createRow(index: number, entry: ResultEntry) {
    const row = this.resultsEl.createDiv({
      cls: ['wm2-search-row', index === this.selected ? 'is-selected' : ''].filter(Boolean),
      attr: {role: 'option', 'aria-selected': String(index === this.selected)},
    });
    row.addEventListener('mousemove', () => {
      if (this.selected === index) return;
      this.selected = index;
      this.resultsEl.querySelectorAll('.wm2-search-row').forEach((el, i) => el.toggleClass('is-selected', i === index));
    });
    row.addEventListener('click', () => void this.openEntry(entry));
    return row;
  }

  private addAction(row: HTMLElement, icon: string, labelKey: string, action: () => void) {
    const button = row.createEl('button', {cls: 'clickable-icon', attr: {type: 'button', 'aria-label': this.plugin.t(labelKey)}});
    button.title = this.plugin.t(labelKey);
    setIcon(button, icon);
    button.addEventListener('click', event => {
      event.stopPropagation();
      action();
    });
  }

  private renderVaultRow(hit: VaultSearchHit, index: number) {
    const entry: ResultEntry = {kind: 'vault', hit};
    const row = this.createRow(index, entry);
    const main = row.createDiv({cls: 'wm2-search-main'});
    main.createDiv({cls: 'wm2-search-title', text: hit.title});
    main.createDiv({cls: 'wm2-search-meta', text: hit.folderPath || '/'});
    const actions = row.createDiv({cls: 'wm2-search-actions'});
    this.addAction(actions, 'link', 'searchModal.insertLink', () => this.insertLink(hit.path));
    this.addAction(actions, 'message-square', 'searchModal.addToChat', () => this.addToChat(entry));
  }

  private renderRemoteRow(hit: WiseMindSearchHit, index: number) {
    const entry: ResultEntry = {kind: 'wisemind', hit};
    const row = this.createRow(index, entry);
    const main = row.createDiv({cls: 'wm2-search-main'});
    const title = main.createDiv({cls: 'wm2-search-title'});
    title.createSpan({cls: 'wm2-chip', text: this.plugin.t(`searchModal.types.${hit.group}`)});
    if (hit.sourceType === 'subscription' || hit.sourceType === 'ai') {
      title.createSpan({cls: 'wm2-chip is-info', text: this.plugin.t(`searchModal.sourceTypes.${hit.sourceType}`)});
    }
    title.createSpan({text: hit.title});
    if (hit.snippet) main.createDiv({cls: 'wm2-search-meta', text: hit.snippet});
    const actions = row.createDiv({cls: 'wm2-search-actions'});
    this.addAction(actions, 'message-square', 'searchModal.addToChat', () => this.addToChat(entry));
    this.addAction(actions, 'external-link', 'searchModal.openInClient', () => void this.openEntry(entry));
  }

  private async openEntry(entry: ResultEntry) {
    this.close();
    if (entry.kind === 'vault') {
      await this.app.workspace.openLinkText(entry.hit.path, this.sourcePath, false);
      return;
    }
    try {
      await this.plugin.api.openSource({
        type: entry.hit.type,
        id: entry.hit.id,
        title: entry.hit.title,
        deckId: entry.hit.deckId,
        folderId: entry.hit.folderId,
        knowledgeBaseId: entry.hit.knowledgeBaseId,
      });
      new Notice(this.plugin.t('searchPage.openedInWiseMind'));
    } catch (error) {
      new Notice((error as Error)?.message || this.plugin.t('searchPage.openWiseMindFailed'));
    }
  }

  private insertLink(path: string) {
    const editor = this.app.workspace.activeEditor?.editor;
    const target = this.app.vault.getAbstractFileByPath(path) as TFile | null;
    if (!editor || !target) {
      new Notice(this.plugin.t('workbench.noEditor'));
      return;
    }
    editor.replaceSelection(this.app.fileManager.generateMarkdownLink(target, this.sourcePath));
    this.close();
  }

  private addToChat(entry: ResultEntry) {
    const message = entry.kind === 'vault'
      ? `@${entry.hit.path} `
      : this.plugin.t('searchPage.continuePrompt', {source: entry.hit.title, keyword: this.query.trim()});
    this.close();
    void this.plugin.openChat(message, false, false);
  }

  private askLibrary() {
    const question = this.query.trim();
    if (!question) return;
    this.close();
    void this.plugin.openChat(question, true, true);
  }
}
