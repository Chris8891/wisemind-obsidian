<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowUpTrayIcon,
  BookmarkSquareIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/vue/24/outline';
import { Notice } from 'obsidian';

import { usePlugin } from '../../composables/usePlugin';
import { languageOptions, setI18nLocale } from '../../i18n';
import { notifyTaskHistoryUpdated } from '../../services/taskHistory';
import { normalizeWiseMindSettings } from '../../settings';
import RekaSelect from '../RekaSelect.vue';
import WiseMindConnectionDialog from '../WiseMindConnectionDialog.vue';
import WiseMindDestinationSelect from '../WiseMindDestinationSelect.vue';
import WmTooltip from '../WmTooltip.vue';

const plugin = usePlugin();
const { t } = useI18n();
const connectionDialogOpen = ref(false);
const importInputEl = ref<HTMLInputElement | null>(null);
const form = reactive({
  apiBaseUrl: plugin.settings.apiBaseUrl,
  language: plugin.settings.assistantDefaults.language,
  contextMenuNoteFolderPath: plugin.settings.contextMenuDefaults.noteFolderPath,
  contextMenuDocumentFolderPath: plugin.settings.contextMenuDefaults.documentFolderPath,
  contextMenuKnowledgeBaseName: plugin.settings.contextMenuDefaults.knowledgeBaseName,
  mentionNoteLimit: plugin.settings.mentionNoteLimit,
  duplicatePolicy: plugin.settings.duplicatePolicy,
});

const uiLanguageOptions = computed(() =>
  languageOptions.map(option => ({value: option.value, label: t(option.labelKey)})),
);

const duplicatePolicyOptions = computed(() => [
  { value: 'update', label: t('settings.duplicateUpdate') },
  { value: 'skip', label: t('settings.duplicateSkip') },
  { value: 'duplicate', label: t('settings.duplicateCreate') },
]);

const syncFormFromSettings = () => {
  form.apiBaseUrl = plugin.settings.apiBaseUrl;
  form.language = plugin.settings.assistantDefaults.language;
  form.contextMenuNoteFolderPath = plugin.settings.contextMenuDefaults.noteFolderPath;
  form.contextMenuDocumentFolderPath = plugin.settings.contextMenuDefaults.documentFolderPath;
  form.contextMenuKnowledgeBaseName = plugin.settings.contextMenuDefaults.knowledgeBaseName;
  form.mentionNoteLimit = plugin.settings.mentionNoteLimit;
  form.duplicatePolicy = plugin.settings.duplicatePolicy;
};

watch(
  () => form.language,
  value => setI18nLocale(value as typeof plugin.settings.assistantDefaults.language),
);

const save = async () => {
  plugin.settings.apiBaseUrl = form.apiBaseUrl.trim();
  plugin.settings.assistantDefaults.language = form.language as typeof plugin.settings.assistantDefaults.language;
  plugin.settings.contextMenuDefaults.noteFolderPath = form.contextMenuNoteFolderPath;
  plugin.settings.contextMenuDefaults.documentFolderPath = form.contextMenuDocumentFolderPath;
  plugin.settings.contextMenuDefaults.knowledgeBaseName = form.contextMenuKnowledgeBaseName;
  const mentionNoteLimit = Math.max(0, Math.floor(Number(form.mentionNoteLimit || 0)));
  plugin.settings.mentionNoteLimit = Number.isFinite(mentionNoteLimit) ? mentionNoteLimit : 0;
  plugin.settings.duplicatePolicy = form.duplicatePolicy as typeof plugin.settings.duplicatePolicy;
  await plugin.saveSettings();
  setI18nLocale(plugin.settings.assistantDefaults.language);
  new Notice(t('common.settingsSaved'));
};

const test = async () => {
  await save();
  const ok = await plugin.testConnection();
  new Notice(ok ? t('common.connected') : t('common.disconnected'));
};

const exportData = () => {
  const exportedAt = new Date();
  const timestamp = exportedAt.toISOString().replace(/[:.]/g, '-');
  const payload = {
    app: 'WiseMindAI Obsidian',
    version: 1,
    exportedAt: exportedAt.toISOString(),
    settings: plugin.settings,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `wisemindai-obsidian-backup-${timestamp}.json`;
  link.click();
  URL.revokeObjectURL(url);
  new Notice(t('settings.backupExported'));
};

const openImportFile = () => {
  importInputEl.value?.click();
};

const importData = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const nextSettings = normalizeWiseMindSettings(parsed?.settings || parsed);
    if (!window.confirm(t('settings.importConfirm'))) return;
    Object.assign(plugin.settings, nextSettings);
    await plugin.saveSettings();
    syncFormFromSettings();
    notifyTaskHistoryUpdated();
    setI18nLocale(plugin.settings.assistantDefaults.language);
    new Notice(t('settings.importSuccess'));
  } catch (error: any) {
    new Notice(error?.message || t('settings.importFailed'));
  }
};
</script>

<template>
  <section class="wm-page">
    <header class="wm-page-header">
      <div class="wm-title-line">
        <Cog6ToothIcon class="wm-title-icon" />
        <h2>{{ t('settings.title') }}</h2>
      </div>
      <div class="wm-toolbar">
        <button class="wm-button" type="button" @click="exportData">
          <ArrowDownTrayIcon class="wm-icon" />
          {{ t('common.export') }}
        </button>
        <button class="wm-button" type="button" @click="openImportFile">
          <ArrowUpTrayIcon class="wm-icon" />
          {{ t('common.import') }}
        </button>
        <button class="wm-button is-primary" type="button" @click="save">{{ t('common.save') }}</button>
      </div>
    </header>
    <input
      ref="importInputEl"
      class="wm-hidden-file-input"
      type="file"
      accept="application/json,.json"
      @change="importData"
    />

    <div class="wm-settings-grid">
      <section class="wm-panel wm-settings-card">
        <div class="wm-panel-title">
          <GlobeAltIcon class="wm-panel-title-icon" />
          <h3>{{ t('settings.apiSection') }}</h3>
        </div>
        <p class="wm-muted">{{ t('settings.apiHint') }}</p>
        <label>
          <span class="wm-setting-label">
            <span>{{ t('settings.apiBaseUrl') }}</span>
            <WmTooltip :content="t('settings.apiHelp')">
              <button class="wm-icon-button wm-settings-help" type="button" @click="connectionDialogOpen = true">
                <QuestionMarkCircleIcon class="wm-icon" />
              </button>
            </WmTooltip>
          </span>
          <input v-model="form.apiBaseUrl" class="wm-input" />
        </label>
        <footer class="wm-actions wm-settings-test-actions">
          <button class="wm-button" type="button" @click="test">
            <ArrowPathIcon class="wm-icon" />
            {{ t('settings.testConnection') }}
          </button>
        </footer>
      </section>

      <section class="wm-panel wm-settings-card">
        <div class="wm-panel-title">
          <DocumentTextIcon class="wm-panel-title-icon" />
          <h3>{{ t('settings.customSection') }}</h3>
        </div>
        <label>
          <span class="wm-setting-label">
            <span>{{ t('settings.language') }}</span>
            <WmTooltip :content="t('settings.languageDesc')">
              <button class="wm-icon-button wm-settings-help" type="button">
                <QuestionMarkCircleIcon class="wm-icon" />
              </button>
            </WmTooltip>
          </span>
          <RekaSelect v-model="form.language" :options="uiLanguageOptions" />
        </label>
        <label>
          <span class="wm-setting-label">
            <span>{{ t('settings.mentionNoteLimit') }}</span>
            <WmTooltip :content="t('settings.mentionNoteLimitDesc')">
              <button class="wm-icon-button wm-settings-help" type="button">
                <QuestionMarkCircleIcon class="wm-icon" />
              </button>
            </WmTooltip>
          </span>
          <input v-model.number="form.mentionNoteLimit" class="wm-input" min="0" type="number" />
          <small class="wm-muted">{{ t('settings.mentionNoteLimitHint') }}</small>
        </label>
        <label>
          <span class="wm-setting-label">
            <span>{{ t('settings.duplicatePolicy') }}</span>
            <WmTooltip :content="t('settings.duplicatePolicyDesc')">
              <button class="wm-icon-button wm-settings-help" type="button">
                <QuestionMarkCircleIcon class="wm-icon" />
              </button>
            </WmTooltip>
          </span>
          <RekaSelect v-model="form.duplicatePolicy" :options="duplicatePolicyOptions" />
        </label>
      </section>

      <section class="wm-panel wm-settings-card">
        <div class="wm-panel-title">
          <BookmarkSquareIcon class="wm-panel-title-icon" />
          <h3>{{ t('settings.contextMenuSection') }}</h3>
        </div>
        <label>
          <span class="wm-setting-label">
            <span>{{ t('settings.defaultNoteFolder') }}</span>
            <WmTooltip :content="t('settings.defaultNoteFolderDesc')">
              <button class="wm-icon-button wm-settings-help" type="button">
                <QuestionMarkCircleIcon class="wm-icon" />
              </button>
            </WmTooltip>
          </span>
          <WiseMindDestinationSelect v-model="form.contextMenuNoteFolderPath" target="notes" />
        </label>
        <label>
          <span class="wm-setting-label">
            <span>{{ t('settings.defaultDocumentFolder') }}</span>
            <WmTooltip :content="t('settings.defaultDocumentFolderDesc')">
              <button class="wm-icon-button wm-settings-help" type="button">
                <QuestionMarkCircleIcon class="wm-icon" />
              </button>
            </WmTooltip>
          </span>
          <WiseMindDestinationSelect v-model="form.contextMenuDocumentFolderPath" target="documents" />
        </label>
        <label>
          <span class="wm-setting-label">
            <span>{{ t('settings.defaultKnowledgeBase') }}</span>
            <WmTooltip :content="t('settings.defaultKnowledgeBaseDesc')">
              <button class="wm-icon-button wm-settings-help" type="button">
                <QuestionMarkCircleIcon class="wm-icon" />
              </button>
            </WmTooltip>
          </span>
          <WiseMindDestinationSelect v-model="form.contextMenuKnowledgeBaseName" target="knowledge" />
        </label>
      </section>

      <section class="wm-panel wm-settings-card">
        <div class="wm-panel-title">
          <DocumentTextIcon class="wm-panel-title-icon" />
          <h3>{{ t('settings.backupSection') }}</h3>
        </div>
        <p class="wm-muted">
          {{ t('settings.backupDesc') }}
        </p>
        <footer class="wm-actions wm-settings-test-actions">
          <button class="wm-button" type="button" @click="exportData">
            <ArrowDownTrayIcon class="wm-icon" />
            {{ t('settings.exportBackup') }}
          </button>
          <button class="wm-button" type="button" @click="openImportFile">
            <ArrowUpTrayIcon class="wm-icon" />
            {{ t('settings.importBackup') }}
          </button>
        </footer>
      </section>
    </div>
    <WiseMindConnectionDialog v-model:open="connectionDialogOpen" />
  </section>
</template>
