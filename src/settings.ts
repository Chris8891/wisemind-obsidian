import { App, Notice, PluginSettingTab, Setting } from 'obsidian';

import {languageOptions, translate} from './i18n';
import type WiseMindObsidianPlugin from './main';
import type { DuplicatePolicy, WiseMindImportSettings } from './types';

export type { WiseMindImportSettings } from './types';

export const DEFAULT_SETTINGS: WiseMindImportSettings = {
  apiBaseUrl: 'http://127.0.0.1:38221',
  defaultTargets: { notes: true, documents: false, knowledge: true },
  defaultWiseMindSources: { notes: true, documents: true, knowledgeDocuments: true },
  showContextMenu: false,
  contextMenuDefaults: {
    noteFolderPath: '',
    documentFolderPath: '',
    knowledgeBaseName: 'Obsidian import',
  },
  contextMenuRecents: {
    notes: [],
    documents: [],
    knowledge: [],
  },
  assistantDefaults: {
    language: 'system',
    summaryStyle: 'markdown',
    cardCount: 5,
    cardDifficulty: 'standard',
    cardStructure: 'concept',
    defaultCardDeckName: 'Obsidian cards',
    defaultCardFolderName: 'Default',
  },
  transcription: {
    defaultScene: 'meeting',
    defaultProviderId: '',
    defaultMicrophoneId: 'default',
    saveAudio: false,
    completionAction: 'ask',
  },
  assistantSummaryHistory: [],
  assistantCardHistory: [],
  assistantChatSessions: [],
  assistantOpenChatSessionIds: [],
  assistantOpenChatSessions: [],
  syncPlans: [],
  syncHistory: [],
  defaultSyncPlanId: '',
  hasSeenTutorial: false,
  defaultKnowledgeBaseName: 'Obsidian import',
  defaultObsidianRootFolder: 'WiseMindAI',
  duplicatePolicy: 'update',
  maxFileSizeKb: 1024,
  mentionNoteLimit: 0,
  ignorePatterns: ['.obsidian/**', '**/.trash/**'],
  chunkSize: 10,
};

export const normalizeWiseMindSettings = (
  raw: Partial<WiseMindImportSettings> | null,
): WiseMindImportSettings => {
  const settings: WiseMindImportSettings = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  settings.showContextMenu = raw?.showContextMenu === true;
  settings.syncPlans = Array.isArray(settings.syncPlans) ? settings.syncPlans : [];
  settings.syncHistory = Array.isArray(settings.syncHistory) ? settings.syncHistory : [];
  settings.assistantSummaryHistory = Array.isArray(settings.assistantSummaryHistory)
    ? settings.assistantSummaryHistory
    : [];
  settings.assistantCardHistory = Array.isArray(settings.assistantCardHistory)
    ? settings.assistantCardHistory
    : [];
  settings.assistantChatSessions = Array.isArray(settings.assistantChatSessions)
    ? settings.assistantChatSessions
    : [];
  settings.assistantOpenChatSessionIds = Array.isArray(settings.assistantOpenChatSessionIds)
    ? settings.assistantOpenChatSessionIds.filter(Boolean)
    : [];
  settings.assistantOpenChatSessions = Array.isArray(settings.assistantOpenChatSessions)
    ? settings.assistantOpenChatSessions.filter(item => item?.id)
    : [];
  settings.contextMenuRecents = {
    notes: settings.contextMenuRecents?.notes || [],
    documents: settings.contextMenuRecents?.documents || [],
    knowledge: settings.contextMenuRecents?.knowledge || [],
  };
  settings.contextMenuDefaults = {
    noteFolderPath: settings.contextMenuDefaults?.noteFolderPath || '',
    documentFolderPath: settings.contextMenuDefaults?.documentFolderPath || '',
    knowledgeBaseName:
      settings.contextMenuDefaults?.knowledgeBaseName ||
      settings.defaultKnowledgeBaseName ||
      DEFAULT_SETTINGS.contextMenuDefaults.knowledgeBaseName,
  };
  settings.assistantDefaults = {
    ...DEFAULT_SETTINGS.assistantDefaults,
    ...(settings.assistantDefaults || {}),
  };
  settings.transcription = {
    ...DEFAULT_SETTINGS.transcription,
    ...(settings.transcription || {}),
  };
  if (!['meeting', 'class', 'interview', 'idea', 'other'].includes(settings.transcription.defaultScene)) {
    settings.transcription.defaultScene = DEFAULT_SETTINGS.transcription.defaultScene;
  }
  if (!['ask', 'current-note', 'new-note'].includes(settings.transcription.completionAction)) {
    settings.transcription.completionAction = DEFAULT_SETTINGS.transcription.completionAction;
  }
  if (!['system', 'zh_CN', 'en_US'].includes(settings.assistantDefaults.language)) {
    settings.assistantDefaults.language = DEFAULT_SETTINGS.assistantDefaults.language;
  }
  settings.assistantDefaults.cardCount = Math.max(
    1,
    Math.min(20, Number(settings.assistantDefaults.cardCount || DEFAULT_SETTINGS.assistantDefaults.cardCount)),
  );
  settings.mentionNoteLimit = Math.max(
    0,
    Math.floor(Number(settings.mentionNoteLimit ?? DEFAULT_SETTINGS.mentionNoteLimit)),
  );
  return settings;
};

export class WiseMindSettingTab extends PluginSettingTab {
  plugin: WiseMindObsidianPlugin;

  constructor(app: App, plugin: WiseMindObsidianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const t = (key: string) => translate(this.plugin.settings.assistantDefaults.language, key);
    containerEl.empty();
    new Setting(containerEl)
      .setName(t('settings.nativeTitle'))
      .setHeading();

    new Setting(containerEl)
      .setName(t('settings.language'))
      .setDesc(t('settings.languageDesc'))
      .addDropdown(dropdown => {
        languageOptions.forEach(option => dropdown.addOption(option.value, t(option.labelKey)));
        return dropdown
          .setValue(this.plugin.settings.assistantDefaults.language)
          .onChange(async value => {
            this.plugin.settings.assistantDefaults.language = value as typeof this.plugin.settings.assistantDefaults.language;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(t('settings.apiBaseUrl'))
      .setDesc(t('settings.apiBaseUrlDesc'))
      .addText(text =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.apiBaseUrl)
          .setValue(this.plugin.settings.apiBaseUrl)
          .onChange(async value => {
            this.plugin.settings.apiBaseUrl = value.trim() || DEFAULT_SETTINGS.apiBaseUrl;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t('settings.showContextMenu'))
      .setDesc(t('settings.showContextMenuDesc'))
      .addToggle(toggle =>
        toggle
          .setValue(this.plugin.settings.showContextMenu)
          .onChange(async value => {
            this.plugin.settings.showContextMenu = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t('settings.mentionNoteLimit'))
      .setDesc(t('settings.mentionNoteLimitDesc'))
      .addText(text =>
        text
          .setPlaceholder('0')
          .setValue(String(this.plugin.settings.mentionNoteLimit ?? DEFAULT_SETTINGS.mentionNoteLimit))
          .onChange(async value => {
            const limit = Math.max(0, Math.floor(Number(value || DEFAULT_SETTINGS.mentionNoteLimit)));
            this.plugin.settings.mentionNoteLimit = Number.isFinite(limit) ? limit : DEFAULT_SETTINGS.mentionNoteLimit;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t('settings.defaultCardCount'))
      .setDesc(t('settings.defaultCardCountDesc'))
      .addText(text =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.assistantDefaults.cardCount))
          .setValue(String(this.plugin.settings.assistantDefaults.cardCount))
          .onChange(async value => {
            const count = Math.max(1, Math.min(20, Number(value || DEFAULT_SETTINGS.assistantDefaults.cardCount)));
            this.plugin.settings.assistantDefaults.cardCount = Number.isFinite(count) ? count : DEFAULT_SETTINGS.assistantDefaults.cardCount;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t('settings.duplicatePolicy'))
      .setDesc(t('settings.duplicatePolicyDesc'))
      .addDropdown(dropdown =>
        dropdown
          .addOption('skip', t('settings.duplicateSkip'))
          .addOption('update', t('settings.duplicateUpdate'))
          .addOption('duplicate', t('settings.duplicateCreate'))
          .setValue(this.plugin.settings.duplicatePolicy)
          .onChange(async value => {
            this.plugin.settings.duplicatePolicy = value as DuplicatePolicy;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t('settings.testConnection'))
      .setDesc(t('settings.apiHint'))
      .addButton(button =>
        button
          .setButtonText(t('settings.testConnection'))
          .setCta()
          .onClick(async () => {
            const ok = await this.plugin.testConnection();
            new Notice(ok ? t('common.connected') : t('common.disconnected'));
          }),
      );
  }
}
