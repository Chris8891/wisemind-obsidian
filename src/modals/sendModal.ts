import {Modal, Notice, setIcon} from 'obsidian';

import logoUrl from '../assets/icons/wisemindai-app.png';
import type WiseMindObsidianPlugin from '../main';
import {
  defaultWiseMindDestinationLabels,
  loadWiseMindDestinationOptions,
  optionToDestination,
  type WiseMindDestination,
  type WiseMindDestinationOption,
  type WiseMindDestinationTarget,
} from '../services/wisemindDestinations';

export type SendAfterOptions = {
  parse: boolean;
  summarize: boolean;
  cards: boolean;
  createRule: boolean;
};

export type SendChoice = {
  target: WiseMindDestinationTarget;
  destination: WiseMindDestination;
  after: SendAfterOptions;
};

const TARGETS: WiseMindDestinationTarget[] = ['documents', 'notes', 'knowledge'];
const TARGET_ICONS: Record<WiseMindDestinationTarget, string> = {
  notes: 'pencil',
  documents: 'file-text',
  knowledge: 'database',
};

/** One dialog to choose both what to create in WiseMindAI and where to put it. */
export class SendModal extends Modal {
  private target: WiseMindDestinationTarget;
  private options: WiseMindDestinationOption[] = [];
  private selectedValue = '';
  private query = '';
  private loading = false;
  private resolved = false;
  private loadId = 0;
  private segmentEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private searchEl: HTMLInputElement | null = null;
  private sendButton: HTMLButtonElement | null = null;
  private after: SendAfterOptions = {parse: true, summarize: true, cards: false, createRule: false};
  private afterChecks = new Map<keyof SendAfterOptions, HTMLInputElement>();

  constructor(
    private plugin: WiseMindObsidianPlugin,
    private description: string,
    private resolve: (choice: SendChoice | null) => void,
    initialTarget: WiseMindDestinationTarget = 'documents',
  ) {
    super(plugin.app);
    this.target = initialTarget;
  }

  onOpen() {
    const t = this.plugin.t.bind(this.plugin);
    this.modalEl.addClass('wm2-modal', 'wm2-send-modal');
    this.titleEl.empty();
    this.titleEl.addClass('wm2-send-title');
    this.titleEl.createEl('img', {cls: 'wm2-send-logo', attr: {src: logoUrl, alt: ''}});
    this.titleEl.createSpan({text: t('sendModal.title')});

    const {contentEl} = this;
    contentEl.empty();
    contentEl.addClass('wm2-send-body');
    contentEl.createDiv({cls: 'wm2-chips'}).createSpan({cls: 'wm2-chip', text: this.description});
    contentEl.createDiv({cls: 'wm2-muted wm2-send-hint', text: t('sendModal.obsidianHint')});

    contentEl.createDiv({cls: 'wm2-send-section-title', text: t('sendModal.sendAs')});
    this.segmentEl = contentEl.createDiv({cls: 'wm2-segmented wm2-send-targets', attr: {role: 'tablist'}});
    TARGETS.forEach(target => {
      const button = this.segmentEl!.createEl('button', {
        attr: {type: 'button', role: 'tab', 'data-target': target},
      });
      setIcon(button.createSpan({cls: 'wm2-send-icon'}), TARGET_ICONS[target]);
      button.createSpan({text: t(`destinationOptions.${target}`)});
      button.addEventListener('click', () => {
        if (this.target === target) return;
        this.target = target;
        this.query = '';
        if (this.searchEl) this.searchEl.value = '';
        void this.loadDestinations();
      });
    });

    contentEl.createDiv({cls: 'wm2-send-section-title', text: t('sendModal.placeWhere')});
    const search = contentEl.createDiv({cls: 'wm2-send-search'});
    setIcon(search.createSpan({cls: 'wm2-send-icon'}), 'search');
    this.searchEl = search.createEl('input', {attr: {type: 'text', placeholder: t('sendModal.search')}});
    this.searchEl.addEventListener('input', () => {
      this.query = this.searchEl!.value.trim().toLowerCase();
      this.renderList();
    });

    this.listEl = contentEl.createDiv({cls: 'wm2-send-list', attr: {role: 'listbox'}});

    contentEl.createDiv({cls: 'wm2-send-section-title', text: t('sendModal.afterImport')});
    const afterBox = contentEl.createDiv({cls: 'wm2-send-after'});
    (
      [
        ['parse', 'sendModal.afterParse'],
        ['summarize', 'sendModal.afterSummarize'],
        ['cards', 'sendModal.afterCards'],
        ['createRule', 'sendModal.afterCreateRule'],
      ] as const
    ).forEach(([key, labelKey]) => {
      const row = afterBox.createEl('label', {cls: 'wm2-send-after-row'});
      const input = row.createEl('input', {attr: {type: 'checkbox'}});
      input.checked = this.after[key];
      input.addEventListener('change', () => {
        this.after[key] = input.checked;
      });
      this.afterChecks.set(key, input);
      row.createSpan({text: t(labelKey)});
    });
    contentEl.createDiv({cls: 'wm2-muted wm2-send-hint', text: t('sendModal.topicJoinHint')});

    const footer = contentEl.createDiv({cls: 'modal-button-container wm2-send-footer'});
    const cancel = footer.createEl('button', {attr: {type: 'button'}});
    setIcon(cancel.createSpan({cls: 'wm2-send-icon'}), 'x');
    cancel.createSpan({text: t('sendModal.cancel')});
    cancel.addEventListener('click', () => this.finish(null));
    this.sendButton = footer.createEl('button', {cls: 'mod-cta', attr: {type: 'button'}});
    setIcon(this.sendButton.createSpan({cls: 'wm2-send-icon'}), 'send');
    this.sendButton.createSpan({text: t('sendModal.send')});
    this.sendButton.addEventListener('click', () => this.submit());

    this.scope.register(['Mod'], 'Enter', () => {
      this.submit();
      return false;
    });

    void this.loadDestinations();
  }

  onClose() {
    this.loadId += 1;
    this.contentEl.empty();
    if (!this.resolved) this.resolve(null);
  }

  private defaultValueFor(target: WiseMindDestinationTarget) {
    const defaults = this.plugin.settings.contextMenuDefaults;
    if (target === 'notes') return defaults.noteFolderPath;
    if (target === 'documents') return defaults.documentFolderPath;
    return defaults.knowledgeBaseName;
  }

  private renderTargets() {
    this.segmentEl?.querySelectorAll('button').forEach(button => {
      const active = button.getAttribute('data-target') === this.target;
      button.toggleClass('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
  }

  private renderList() {
    const list = this.listEl;
    if (!list) return;
    list.empty();
    if (this.loading) {
      list.createDiv({cls: 'wm2-send-empty'}).createSpan({cls: 'wm2-spinner'});
      return;
    }
    const visible = this.options.filter(
      option => !this.query || `${option.label} ${option.meta}`.toLowerCase().includes(this.query),
    );
    if (!visible.length) {
      const enabled = this.options.some(option => !option.disabled);
      list.createDiv({
        cls: 'wm2-send-empty wm2-muted',
        text: enabled ? this.plugin.t('shared.noMatches') : this.plugin.t('contextMenu.noKnowledgeDetailed'),
      });
      return;
    }
    const defaultValue = this.defaultValueFor(this.target);
    visible.forEach(option => {
      const row = list.createEl('button', {
        cls: 'wm2-send-option',
        attr: {type: 'button', role: 'option', 'aria-selected': String(option.value === this.selectedValue)},
      });
      row.toggleClass('is-active', option.value === this.selectedValue);
      row.disabled = Boolean(option.disabled);
      setIcon(row.createSpan({cls: 'wm2-send-icon'}), this.target === 'knowledge' ? 'database' : 'folder');
      row.createSpan({cls: 'wm2-send-option-label', text: option.label});
      const isDefault = option.value === defaultValue || option.label === defaultValue;
      const meta = [isDefault ? this.plugin.t('sendModal.default') : '', option.meta].filter(Boolean).join(' · ');
      if (meta) row.createSpan({cls: 'wm2-send-option-meta', text: meta});
      // Toggling in place keeps the row element alive, so the following dblclick still lands on it.
      row.addEventListener('click', () => {
        this.selectedValue = option.value;
        list.querySelectorAll('.wm2-send-option').forEach(el => {
          el.toggleClass('is-active', el === row);
          el.setAttribute('aria-selected', String(el === row));
        });
      });
      row.addEventListener('dblclick', () => {
        this.selectedValue = option.value;
        this.submit();
      });
    });
  }

  private async loadDestinations() {
    const loadId = ++this.loadId;
    this.renderTargets();
    this.loading = true;
    this.renderList();
    if (this.sendButton) this.sendButton.disabled = true;
    const options = await loadWiseMindDestinationOptions(this.plugin.api, this.target, this.labels()).catch(() => []);
    if (loadId !== this.loadId) return;

    this.options = options;
    this.loading = false;
    const enabled = options.filter(option => !option.disabled);
    const preferredValue = this.defaultValueFor(this.target);
    const preferred = enabled.find(option => option.value === preferredValue || option.label === preferredValue) || enabled[0];
    this.selectedValue = preferred?.value || '';
    if (this.sendButton) this.sendButton.disabled = !enabled.length;
    this.renderList();
  }

  private submit() {
    // While a new target loads, `options` still belongs to the previous target.
    if (this.loading || this.resolved) return;
    const option = this.options.find(item => item.value === this.selectedValue && !item.disabled);
    if (!option) {
      new Notice(this.plugin.t('contextMenu.chooseTargetFirst'));
      return;
    }
    this.finish({
      target: this.target,
      destination: optionToDestination(this.target, option),
      after: {...this.after},
    });
  }

  private finish(choice: SendChoice | null) {
    this.resolved = true;
    this.resolve(choice);
    this.close();
  }

  private labels() {
    return {
      ...defaultWiseMindDestinationLabels,
      notes: this.plugin.t('destinationOptions.notes'),
      documents: this.plugin.t('destinationOptions.documents'),
      knowledge: this.plugin.t('destinationOptions.knowledge'),
      noKnowledge: this.plugin.t('destinationOptions.noKnowledge'),
      createKnowledgeFirst: this.plugin.t('destinationOptions.createKnowledgeFirst'),
      knowledgeMeta: this.plugin.t('destinationOptions.knowledgeMeta'),
      rootFolder: this.plugin.t('destinationOptions.rootFolder'),
      folder: this.plugin.t('destinationOptions.folder'),
    };
  }
}

export const openSendModal = (
  plugin: WiseMindObsidianPlugin,
  description: string,
  initialTarget?: WiseMindDestinationTarget,
) =>
  new Promise<SendChoice | null>(resolve => {
    new SendModal(plugin, description, resolve, initialTarget).open();
  });
