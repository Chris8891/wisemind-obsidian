import { App, Notice, PluginSettingTab, Setting, type TextComponent } from 'obsidian';

import { capabilityState, hasFeature } from './services/capabilities';
import { setOnboardingOpen } from './services/panelStore';
import { notifyTaskHistoryUpdated } from './services/taskHistory';
import { CLIENT_SETTING_PAGES, FEATURES } from './features';
import {languageOptions, translate} from './i18n';
import {
  checkApiBaseUrl,
  DEFAULT_API_BASE_URL,
  sanitizeApiBaseUrl,
} from './loopback';
import type WiseMindObsidianPlugin from './main';
import type {
  ChatScope,
  DuplicatePolicy,
  SyncConflictPolicy,
  SyncRule,
  TranscriptionCompletionAction,
  TranscriptionScene,
  WiseMindImportSettings,
} from './types';

export type { WiseMindImportSettings } from './types';

const WEBSITE_URL = 'https://wisemindai.app';
const REVIEW_LIMIT_MIN = 10;
const REVIEW_LIMIT_MAX = 200;
const URL_CHECK_DELAY_MS = 800;
const TEXT_SAVE_DELAY_MS = 500;
const USAGE_KEYS = ['fileCount', 'noteCount', 'knowledgeCount', 'workspaceCount'];

export const DEFAULT_SETTINGS: WiseMindImportSettings = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  defaultTargets: { notes: true, documents: false, knowledge: true },
  defaultWiseMindSources: { notes: true, documents: true, knowledgeDocuments: true },
  showContextMenu: true,
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
  transcriptionHistory: [],
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
  mentionNoteLimit: 40,
  ignorePatterns: ['.obsidian/**', '**/.trash/**'],
  chunkSize: 10,
  selectionToolbar: true,
  rewritePreview: true,
  review: {
    includeNew: true,
    sessionLimit: 50,
    trackRename: true,
    reminder: true,
    reminderTime: '09:00',
    lastReminderDate: '',
  },
  workspaceId: '',
  syncRules: [],
  syncAuto: true,
  syncRespectPrivate: true,
  syncConflictPolicy: 'ask',
  slashCommands: true,
  chatScope: 'note-library',
};

const normalizeSyncRule = (raw: Partial<SyncRule> | null | undefined, index: number): SyncRule | null => {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind === 'tag' ? 'tag' : 'folder';
  const value = String(raw.value ?? '').trim();
  if (kind === 'tag' && !value) return null;
  const ids = Array.isArray(raw.knowledgeBaseIds) ? raw.knowledgeBaseIds.map(Number).filter(id => Number.isFinite(id) && id > 0) : [];
  return {
    id: String(raw.id || `rule-${Date.now()}-${index}`),
    kind,
    value,
    includeSubfolders: raw.includeSubfolders !== false,
    trigger: raw.trigger === 'manual' ? 'manual' : 'auto',
    knowledgeBaseIds: ids,
    knowledgeBaseNames: Array.isArray(raw.knowledgeBaseNames) ? raw.knowledgeBaseNames.map(String) : [],
    enabled: raw.enabled !== false,
    createdAt: Number(raw.createdAt) || Date.now(),
  };
};

const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const num = Math.floor(Number(value));
  return Number.isFinite(num) ? Math.max(min, Math.min(max, num)) : fallback;
};

export const normalizeWiseMindSettings = (
  raw: Partial<WiseMindImportSettings> | null,
): WiseMindImportSettings => {
  const settings: WiseMindImportSettings = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  settings.showContextMenu = raw?.showContextMenu !== false;
  settings.selectionToolbar = raw?.selectionToolbar !== false;
  settings.rewritePreview = raw?.rewritePreview !== false;
  settings.review = {
    ...DEFAULT_SETTINGS.review,
    ...(raw?.review || {}),
  };
  settings.review.sessionLimit = clampNumber(
    settings.review.sessionLimit,
    REVIEW_LIMIT_MIN,
    REVIEW_LIMIT_MAX,
    DEFAULT_SETTINGS.review.sessionLimit,
  );
  if (!REMINDER_TIME_PATTERN.test(settings.review.reminderTime)) {
    settings.review.reminderTime = DEFAULT_SETTINGS.review.reminderTime;
  }
  settings.ignorePatterns = Array.isArray(settings.ignorePatterns)
    ? settings.ignorePatterns.map(item => String(item).trim()).filter(Boolean)
    : [...DEFAULT_SETTINGS.ignorePatterns];
  settings.syncPlans = Array.isArray(settings.syncPlans) ? settings.syncPlans : [];
  settings.syncHistory = Array.isArray(settings.syncHistory) ? settings.syncHistory : [];
  settings.transcriptionHistory = Array.isArray(settings.transcriptionHistory)
    ? settings.transcriptionHistory.filter(item => item?.id).slice(0, 30)
    : [];
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
  settings.assistantDefaults.cardCount = clampNumber(
    settings.assistantDefaults.cardCount,
    1,
    20,
    DEFAULT_SETTINGS.assistantDefaults.cardCount,
  );
  settings.mentionNoteLimit = clampNumber(
    settings.mentionNoteLimit ?? DEFAULT_SETTINGS.mentionNoteLimit,
    0,
    200,
    DEFAULT_SETTINGS.mentionNoteLimit,
  );
  settings.workspaceId = typeof raw?.workspaceId === 'string' ? raw.workspaceId : '';
  const rawRules = raw?.syncRules;
  settings.syncRules = Array.isArray(rawRules)
    ? rawRules.map((rule, index) => normalizeSyncRule(rule, index)).filter((rule): rule is SyncRule => Boolean(rule))
    : [];
  settings.syncAuto = raw?.syncAuto !== false;
  settings.syncRespectPrivate = raw?.syncRespectPrivate !== false;
  settings.syncConflictPolicy = raw?.syncConflictPolicy === 'overwrite' ? 'overwrite' : 'ask';
  settings.slashCommands = raw?.slashCommands !== false;
  settings.chatScope = (['note', 'note-library', 'topic', 'web'] as ChatScope[]).includes(raw?.chatScope as ChatScope)
    ? (raw!.chatScope as ChatScope)
    : DEFAULT_SETTINGS.chatScope;
  settings.apiBaseUrl = sanitizeApiBaseUrl(settings.apiBaseUrl);
  return settings;
};

/** Native Obsidian settings tab. Every change is saved immediately. */
export class WiseMindSettingTab extends PluginSettingTab {
  plugin: WiseMindObsidianPlugin;
  private urlCheckTimer = 0;
  private pendingUrl = '';
  private textSaveTimer = 0;

  constructor(app: App, plugin: WiseMindObsidianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private t(key: string, params?: Record<string, unknown>) {
    return translate(this.plugin.settings.assistantDefaults.language, key, params);
  }

  private save = async () => {
    window.clearTimeout(this.textSaveTimer);
    this.textSaveTimer = 0;
    await this.plugin.saveSettings();
  };

  /** Text fields update settings in memory right away but write to disk once typing pauses. */
  private saveSoon() {
    window.clearTimeout(this.textSaveTimer);
    this.textSaveTimer = window.setTimeout(() => void this.save().catch(() => undefined), TEXT_SAVE_DELAY_MS);
  }

  private async applyApiUrl(url: string) {
    window.clearTimeout(this.urlCheckTimer);
    this.pendingUrl = '';
    this.plugin.settings.apiBaseUrl = url;
    await this.save();
    return this.plugin.testConnection();
  }

  hide() {
    window.clearTimeout(this.urlCheckTimer);
    if (this.pendingUrl) void this.applyApiUrl(this.pendingUrl);
    else if (this.textSaveTimer) void this.save();
  }

  /** Shows the clamped value again once the field loses focus, so the field matches what was saved. */
  private numberField(text: TextComponent, read: () => number, write: (value: string) => void) {
    text.setValue(String(read())).onChange(value => {
      write(value);
      this.saveSoon();
    });
    text.inputEl.addEventListener('blur', () => text.setValue(String(read())));
    return text;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.renderConnection(containerEl);
    this.renderAssistant(containerEl);
    this.renderReview(containerEl);
    this.renderSend(containerEl);
    this.renderTranscription(containerEl);
    this.renderSync(containerEl);
    this.renderData(containerEl);
    this.renderAbout(containerEl);
  }

  private renderConnection(containerEl: HTMLElement) {
    const t = this.t.bind(this);
    new Setting(containerEl).setName(t('settingsV2.connection')).setDesc(t('settingsV2.connectionDesc')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.apiBaseUrl'))
      .setDesc(t('settings.apiBaseUrlDesc'))
      .addText(text =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.apiBaseUrl)
          .setValue(this.plugin.settings.apiBaseUrl)
          .onChange(value => {
            window.clearTimeout(this.urlCheckTimer);
            const url = value.trim() || DEFAULT_SETTINGS.apiBaseUrl;
            const check = checkApiBaseUrl(url);
            // Half-typed or non-loopback addresses stay out of the saved settings.
            if (check === 'invalid') {
              this.pendingUrl = '';
              status.setDesc(t('settingsV2.invalidApiUrl'));
              return;
            }
            if (check === 'not-loopback') {
              this.pendingUrl = '';
              status.setDesc(t('settingsV2.loopbackOnly'));
              return;
            }
            this.pendingUrl = url.replace(/\/+$/, '');
            this.urlCheckTimer = window.setTimeout(async () => {
              const ok = await this.applyApiUrl(this.pendingUrl);
              status.setDesc(ok ? t('common.connected') : t('common.disconnected'));
            }, URL_CHECK_DELAY_MS);
          }),
      );

    const status = new Setting(containerEl)
      .setName(t('settingsV2.status'))
      .setDesc(this.plugin.connected ? t('common.connected') : t('common.disconnected'));
    status.addButton(button =>
      button
        .setButtonText(t('settings.testConnection'))
        .setCta()
        .onClick(async () => {
          const ok = this.pendingUrl ? await this.applyApiUrl(this.pendingUrl) : await this.plugin.testConnection();
          status.setDesc(ok ? t('common.connected') : t('common.disconnected'));
          new Notice(ok ? t('common.connected') : t('common.disconnected'));
          if (ok) this.display();
        }),
    );

    if (!this.plugin.connected) return;
    this.renderAiStatus(containerEl);
    if (hasFeature(FEATURES.usage)) this.renderUsage(containerEl);
    if (hasFeature(FEATURES.workspace)) this.renderWorkspace(containerEl);
  }

  private renderAiStatus(containerEl: HTMLElement) {
    const t = this.t.bind(this);
    const ready = capabilityState.aiReady;
    const setting = new Setting(containerEl)
      .setName(t('settingsV2.aiStatus'))
      .setDesc(ready
        ? t('settingsV2.aiReady', {model: capabilityState.aiModel || t('settingsV2.aiModelUnknown')})
        : t('settingsV2.aiNotReady'));
    if (capabilityState.appVersion) {
      setting.settingEl.createDiv({cls: 'setting-item-description', text: t('settingsV2.clientVersion', {version: capabilityState.appVersion})});
    }
    setting.addButton(button => {
      button.setButtonText(t(ready ? 'settingsV2.manageAi' : 'capability.connectAi')).onClick(() => void this.plugin.openAiSettings());
      if (!ready) button.setCta();
    });
  }

  private renderUsage(containerEl: HTMLElement) {
    const t = this.t.bind(this);
    const setting = new Setting(containerEl).setName(t('settingsV2.usage')).setDesc(t('settingsV2.usageLoading'));
    setting.addButton(button =>
      button.setButtonText(t('capability.upgrade')).onClick(() => void this.plugin.api.openClientSetting(CLIENT_SETTING_PAGES.subscribe)),
    );
    void this.plugin.api.getAccountUsage().then(
      usage => {
        const parts = (usage?.items || [])
          .filter(item => USAGE_KEYS.includes(item.key))
          .map(item => t('settingsV2.usageItem', {
            name: t(`settingsV2.usageKeys.${item.key}`),
            usage: item.usage,
            limit: item.limit === null ? t('settingsV2.unlimited') : item.limit,
          }));
        const plan = usage?.plan === 'pro' ? t('settingsV2.planPro') : t('settingsV2.planFree');
        setting.setDesc([plan, ...parts].join(' · '));
      },
      () => setting.setDesc(t('settingsV2.usageFailed')),
    );
  }

  private renderWorkspace(containerEl: HTMLElement) {
    const t = this.t.bind(this);
    new Setting(containerEl)
      .setName(t('settingsV2.workspace'))
      .setDesc(t('settingsV2.workspaceDesc'))
      .addDropdown(dropdown => {
        dropdown.addOption('', t('settingsV2.workspaceFollow'));
        const current = this.plugin.settings.workspaceId;
        if (current) dropdown.addOption(current, current);
        dropdown.setValue(current).onChange(async value => {
          this.plugin.settings.workspaceId = value;
          await this.save();
          // The sync index keeps records per learning space, so the next scan picks the new space's records.
          void this.plugin.syncEngine.scan();
        });
        void this.plugin.api.getWorkspaceState().then(
          state => {
            dropdown.selectEl.empty();
            dropdown.addOption('', t('settingsV2.workspaceFollow'));
            const workspaces = state?.workspaces || [];
            workspaces.forEach(workspace => dropdown.addOption(workspace.id, workspace.name || workspace.id));
            if (current && !workspaces.some(workspace => workspace.id === current)) {
              dropdown.addOption(current, t('settingsV2.workspaceMissing'));
            }
            dropdown.setValue(current);
          },
          () => undefined,
        );
        return dropdown;
      });
  }

  private renderAssistant(containerEl: HTMLElement) {
    const t = this.t.bind(this);
    new Setting(containerEl).setName(t('settingsV2.assistant')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.language'))
      .setDesc(t('settings.languageDesc'))
      .addDropdown(dropdown => {
        languageOptions.forEach(option => dropdown.addOption(option.value, t(option.labelKey)));
        return dropdown
          .setValue(this.plugin.settings.assistantDefaults.language)
          .onChange(async value => {
            this.plugin.settings.assistantDefaults.language = value as typeof this.plugin.settings.assistantDefaults.language;
            await this.save();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(t('settingsV2.selectionToolbar'))
      .setDesc(t('settingsV2.selectionToolbarDesc'))
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.selectionToolbar).onChange(async value => {
          this.plugin.settings.selectionToolbar = value;
          await this.save();
        }),
      );

    new Setting(containerEl)
      .setName(t('settingsV2.slashCommands'))
      .setDesc(t('settingsV2.slashCommandsDesc'))
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.slashCommands).onChange(async value => {
          this.plugin.settings.slashCommands = value;
          await this.save();
        }),
      );

    if (hasFeature(FEATURES.chatScope)) {
      new Setting(containerEl)
        .setName(t('settingsV2.chatScope'))
        .setDesc(t('settingsV2.chatScopeDesc'))
        .addDropdown(dropdown => {
          (['note', 'note-library', 'topic', 'web'] as ChatScope[]).forEach(scope =>
            dropdown.addOption(scope, t(`chatScope.${scope}`)),
          );
          return dropdown.setValue(this.plugin.settings.chatScope).onChange(async value => {
            this.plugin.settings.chatScope = value as ChatScope;
            await this.save();
          });
        });
    }

    new Setting(containerEl)
      .setName(t('settingsV2.rewritePreview'))
      .setDesc(t('settingsV2.rewritePreviewDesc'))
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.rewritePreview).onChange(async value => {
          this.plugin.settings.rewritePreview = value;
          await this.save();
        }),
      );

    new Setting(containerEl)
      .setName(t('settings.defaultCardCount'))
      .setDesc(t('settings.defaultCardCountDesc'))
      .addText(text =>
        this.numberField(
          text.setPlaceholder(String(DEFAULT_SETTINGS.assistantDefaults.cardCount)),
          () => this.plugin.settings.assistantDefaults.cardCount,
          value => {
            this.plugin.settings.assistantDefaults.cardCount = clampNumber(
              value,
              1,
              20,
              DEFAULT_SETTINGS.assistantDefaults.cardCount,
            );
          },
        ),
      );

    new Setting(containerEl)
      .setName(t('settings.mentionNoteLimit'))
      .setDesc(t('settings.mentionNoteLimitDesc'))
      .addText(text =>
        this.numberField(
          text.setPlaceholder(String(DEFAULT_SETTINGS.mentionNoteLimit)),
          () => this.plugin.settings.mentionNoteLimit ?? DEFAULT_SETTINGS.mentionNoteLimit,
          value => {
            this.plugin.settings.mentionNoteLimit = clampNumber(
              value,
              0,
              200,
              DEFAULT_SETTINGS.mentionNoteLimit,
            );
          },
        ),
      );
  }

  private renderReview(containerEl: HTMLElement) {
    const t = this.t.bind(this);
    new Setting(containerEl).setName(t('settingsV2.review')).setHeading();

    new Setting(containerEl)
      .setName(t('settingsV2.reviewIncludeNew'))
      .setDesc(t('settingsV2.reviewIncludeNewDesc'))
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.review.includeNew).onChange(async value => {
          this.plugin.settings.review.includeNew = value;
          await this.save();
        }),
      );

    new Setting(containerEl)
      .setName(t('settingsV2.reviewDailyLimit'))
      .setDesc(t('settingsV2.reviewDailyLimitDesc'))
      .addText(text =>
        this.numberField(
          text.setPlaceholder(String(DEFAULT_SETTINGS.review.sessionLimit)),
          () => this.plugin.settings.review.sessionLimit,
          value => {
            this.plugin.settings.review.sessionLimit = clampNumber(
              value,
              REVIEW_LIMIT_MIN,
              REVIEW_LIMIT_MAX,
              DEFAULT_SETTINGS.review.sessionLimit,
            );
          },
        ),
      );

    new Setting(containerEl)
      .setName(t('settingsV2.reviewReminder'))
      .setDesc(t('settingsV2.reviewReminderDesc'))
      .addText(text => {
        text.inputEl.type = 'time';
        text.setValue(this.plugin.settings.review.reminderTime).onChange(async value => {
          if (!REMINDER_TIME_PATTERN.test(value)) return;
          this.plugin.settings.review.reminderTime = value;
          this.plugin.settings.review.lastReminderDate = '';
          await this.save();
        });
      })
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.review.reminder).onChange(async value => {
          this.plugin.settings.review.reminder = value;
          await this.save();
        }),
      );

    new Setting(containerEl)
      .setName(t('settingsV2.trackRename'))
      .setDesc(t('settingsV2.trackRenameDesc'))
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.review.trackRename).onChange(async value => {
          this.plugin.settings.review.trackRename = value;
          await this.save();
        }),
      );
  }

  private renderSend(containerEl: HTMLElement) {
    const t = this.t.bind(this);
    const defaults = this.plugin.settings.contextMenuDefaults;
    new Setting(containerEl).setName(t('settingsV2.sendSection')).setHeading();

    new Setting(containerEl)
      .setName(t('settings.showContextMenu'))
      .setDesc(t('settingsV2.showContextMenuDesc'))
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.showContextMenu).onChange(async value => {
          this.plugin.settings.showContextMenu = value;
          await this.save();
        }),
      );

    const textSetting = (name: string, value: string, apply: (next: string) => void) =>
      new Setting(containerEl).setName(name).addText(text =>
        text
          .setPlaceholder(t('settingsV2.folderPlaceholder'))
          .setValue(value)
          .onChange(next => {
            apply(next.trim());
            this.saveSoon();
          }),
      );

    textSetting(t('settingsV2.defaultNoteFolder'), defaults.noteFolderPath, next => {
      defaults.noteFolderPath = next;
    });
    textSetting(t('settingsV2.defaultDocumentFolder'), defaults.documentFolderPath, next => {
      defaults.documentFolderPath = next;
    });
    textSetting(t('settingsV2.defaultKnowledgeBase'), defaults.knowledgeBaseName, next => {
      defaults.knowledgeBaseName = next || DEFAULT_SETTINGS.contextMenuDefaults.knowledgeBaseName;
    });

    new Setting(containerEl)
      .setName(t('settings.duplicatePolicy'))
      .setDesc(t('settings.duplicatePolicyDesc'))
      .addDropdown(dropdown =>
        dropdown
          .addOption('update', t('settings.duplicateUpdate'))
          .addOption('skip', t('settings.duplicateSkip'))
          .addOption('duplicate', t('settings.duplicateCreate'))
          .setValue(this.plugin.settings.duplicatePolicy)
          .onChange(async value => {
            this.plugin.settings.duplicatePolicy = value as DuplicatePolicy;
            await this.save();
          }),
      );
  }

  private renderTranscription(containerEl: HTMLElement) {
    const t = this.t.bind(this);
    const transcription = this.plugin.settings.transcription;
    new Setting(containerEl).setName(t('settingsV2.transcription')).setDesc(t('settings.transcriptionDesc')).setHeading();

    new Setting(containerEl).setName(t('settings.transcriptionDefaultScene')).addDropdown(dropdown => {
      ['meeting', 'class', 'interview', 'idea', 'other'].forEach(scene =>
        dropdown.addOption(scene, t(`transcription.scenes.${scene}`)),
      );
      return dropdown.setValue(transcription.defaultScene).onChange(async value => {
        transcription.defaultScene = value as TranscriptionScene;
        await this.save();
      });
    });

    new Setting(containerEl)
      .setName(t('settings.transcriptionSaveAudio'))
      .setDesc(t('settings.transcriptionSaveAudioDesc'))
      .addToggle(toggle =>
        toggle.setValue(transcription.saveAudio).onChange(async value => {
          transcription.saveAudio = value;
          await this.save();
        }),
      );

    new Setting(containerEl).setName(t('settings.transcriptionCompletionAction')).addDropdown(dropdown => {
      ['ask', 'current-note', 'new-note'].forEach(action =>
        dropdown.addOption(action, t(`settings.transcriptionCompletionOptions.${action}`)),
      );
      return dropdown.setValue(transcription.completionAction).onChange(async value => {
        transcription.completionAction = value as TranscriptionCompletionAction;
        await this.save();
      });
    });
  }

  private renderSync(containerEl: HTMLElement) {
    const t = this.t.bind(this);
    new Setting(containerEl).setName(t('settingsV2.sync')).setDesc(t('settingsV2.syncOneWayDesc')).setHeading();

    new Setting(containerEl)
      .setName(t('settingsV2.syncAuto'))
      .setDesc(t('settingsV2.syncAutoDesc'))
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.syncAuto).onChange(async value => {
          this.plugin.settings.syncAuto = value;
          await this.save();
        }),
      );

    new Setting(containerEl)
      .setName(t('settingsV2.syncConflictPolicy'))
      .setDesc(t('settingsV2.syncConflictPolicyDesc'))
      .addDropdown(dropdown =>
        dropdown
          .addOption('ask', t('settingsV2.syncConflictAsk'))
          .addOption('overwrite', t('settingsV2.syncConflictOverwrite'))
          .setValue(this.plugin.settings.syncConflictPolicy)
          .onChange(async value => {
            this.plugin.settings.syncConflictPolicy = value as SyncConflictPolicy;
            await this.save();
          }),
      );

    new Setting(containerEl)
      .setName(t('settingsV2.syncRespectPrivate'))
      .setDesc(t('settingsV2.syncRespectPrivateDesc'))
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.syncRespectPrivate).onChange(async value => {
          this.plugin.settings.syncRespectPrivate = value;
          await this.save();
        }),
      );

    new Setting(containerEl)
      .setName(t('settingsV2.syncClearLocal'))
      .setDesc(t('settingsV2.syncClearLocalDesc'))
      .addButton(button =>
        button
          .setButtonText(t('settingsV2.syncClearLocalButton'))
          .setWarning()
          .onClick(async () => {
            if (!window.confirm(t('settingsV2.syncClearLocalConfirm'))) return;
            await this.plugin.syncEngine.clearLocalData();
            new Notice(t('settingsV2.syncClearLocalDone'));
          }),
      );

    new Setting(containerEl)
      .setName(t('settingsV2.ignorePatterns'))
      .setDesc(t('settingsV2.ignorePatternsDesc'))
      .addTextArea(text =>
        text
          .setPlaceholder('Private/**')
          .setValue(this.plugin.settings.ignorePatterns.join('\n'))
          .onChange(value => {
            this.plugin.settings.ignorePatterns = value
              .split(/\r?\n/)
              .map(item => item.trim())
              .filter(Boolean);
            this.saveSoon();
          }),
      );
  }

  private renderData(containerEl: HTMLElement) {
    const t = this.t.bind(this);
    new Setting(containerEl).setName(t('settingsV2.data')).setDesc(t('settings.backupDesc')).setHeading();

    new Setting(containerEl)
      .addButton(button => button.setButtonText(t('settingsV2.exportBackup')).onClick(() => this.exportData()))
      .addButton(button => button.setButtonText(t('settingsV2.importBackup')).onClick(() => this.pickImportFile()));
  }

  private renderAbout(containerEl: HTMLElement) {
    const t = this.t.bind(this);
    new Setting(containerEl).setName(t('settingsV2.about')).setHeading();

    new Setting(containerEl)
      .setName(t('settingsV2.version', {version: this.plugin.manifest.version}))
      .addButton(button =>
        button.setButtonText(t('settingsV2.reopenGuide')).onClick(async () => {
          this.plugin.settings.hasSeenTutorial = false;
          await this.save();
          setOnboardingOpen(true);
          await this.plugin.activateView();
        }),
      )
      .addButton(button =>
        button.setButtonText(t('shell.openWebsite')).onClick(() => {
          window.open(WEBSITE_URL, '_blank', 'noopener,noreferrer');
        }),
      );
  }

  private exportData() {
    const exportedAt = new Date();
    const timestamp = exportedAt.toISOString().replace(/[:.]/g, '-');
    // Default export redacts chat bodies so backups do not leak full conversation text.
    const settings = {
      ...this.plugin.settings,
      assistantChatSessions: (this.plugin.settings.assistantChatSessions || []).map(session => ({
        ...session,
        messages: (session.messages || []).map(message => ({
          ...message,
          content: '',
        })),
      })),
      assistantOpenChatSessions: (this.plugin.settings.assistantOpenChatSessions || []).map(session => ({
        ...session,
        draftInput: '',
      })),
    };
    const payload = {
      app: 'WiseMindAI Obsidian',
      version: 2,
      exportedAt: exportedAt.toISOString(),
      chatBodiesRedacted: true,
      settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = createEl('a', { attr: { href: url, download: `wisemindai-obsidian-backup-${timestamp}.json` } });
    link.click();
    // Revoking synchronously can cancel the download before the browser has read the blob.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    new Notice(this.t('settings.backupExported'));
  }

  private pickImportFile() {
    const input = createEl('input', { attr: { type: 'file', accept: 'application/json,.json' } });
    input.addEventListener('change', () => void this.importData(input.files?.[0]));
    input.click();
  }

  private async importData(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const rawSettings = parsed?.settings || parsed;
      const incomingUrl = String(rawSettings?.apiBaseUrl || '').trim();
      if (incomingUrl && checkApiBaseUrl(incomingUrl) === 'not-loopback') {
        new Notice(this.t('settings.importRejectedRemoteApi'));
        return;
      }
      const nextSettings = normalizeWiseMindSettings(rawSettings);
      const summary = this.t('settings.importConfirmDetail', {
        apiBaseUrl: nextSettings.apiBaseUrl,
        chats: nextSettings.assistantChatSessions?.length || 0,
        history: (nextSettings.assistantSummaryHistory?.length || 0)
          + (nextSettings.assistantCardHistory?.length || 0),
      });
      if (!window.confirm(`${this.t('settings.importConfirm')}\n\n${summary}`)) return;
      Object.assign(this.plugin.settings, nextSettings);
      await this.save();
      notifyTaskHistoryUpdated();
      this.display();
      new Notice(this.t('settings.importSuccess'));
    } catch (error: any) {
      new Notice(error?.message || this.t('settings.importFailed'));
    }
  }
}
