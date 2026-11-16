<script setup lang="ts">
  import {computed, onMounted, ref} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowPathIcon,
    ArrowUpTrayIcon,
    ExclamationTriangleIcon,
    FolderIcon,
    HashtagIcon,
    PencilSquareIcon,
    PlusIcon,
    StopIcon,
    TrashIcon,
  } from '@heroicons/vue/24/outline';

  import {usePlugin} from '../../../../composables/usePlugin';
  import {CLIENT_SETTING_PAGES} from '../../../../features';
  import type {SyncConflictItem} from '../../../../sync/syncEngine';
  import type {SyncRule} from '../../../../types';
  import RekaSwitch from '../../../RekaSwitch.vue';
  import WmTooltip from '../../../WmTooltip.vue';

  import SyncConflictDialog from './SyncConflictDialog.vue';
  import SyncRuleDialog from './SyncRuleDialog.vue';

  const PENDING_VISIBLE = 6;

  const {t} = useI18n();
  const plugin = usePlugin();
  const engine = plugin.syncEngine;
  const state = engine.state;

  const rules = ref<SyncRule[]>([...plugin.settings.syncRules]);
  const ruleDialogOpen = ref(false);
  const editingRule = ref<SyncRule | null>(null);
  const conflictOpen = ref(false);
  const activeConflict = ref<SyncConflictItem | null>(null);
  const resolving = ref(false);
  const showAllPending = ref(false);

  const busy = computed(() => state.phase !== 'idle');
  const hasRules = computed(() => rules.value.some(rule => rule.enabled));
  const percent = computed(() => (state.run.total ? Math.round((state.run.done / state.run.total) * 100) : 0));
  const visiblePending = computed(() => (showAllPending.value ? state.pending : state.pending.slice(0, PENDING_VISIBLE)));
  const visibleFailures = computed(() => state.failures.slice(0, PENDING_VISIBLE));
  const lastRunText = computed(() => {
    if (!state.lastRunAt || !state.run.total) return '';
    const time = new Date(state.lastRunAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    return t('syncRules.lastRun', {time, uploaded: state.run.uploaded, failed: state.run.failed});
  });

  const persistRules = async (next: SyncRule[]) => {
    rules.value = next;
    plugin.settings.syncRules = next;
    await plugin.saveSettings();
    void engine.scan();
  };

  const openRule = (rule: SyncRule | null) => {
    editingRule.value = rule;
    ruleDialogOpen.value = true;
  };

  const saveRule = async (rule: SyncRule) => {
    const exists = rules.value.some(item => item.id === rule.id);
    ruleDialogOpen.value = false;
    await persistRules(exists ? rules.value.map(item => (item.id === rule.id ? rule : item)) : [...rules.value, rule]);
  };

  const toggleRule = (rule: SyncRule, enabled: boolean) =>
    persistRules(rules.value.map(item => (item.id === rule.id ? {...item, enabled} : item)));

  const removeRule = (rule: SyncRule) => {
    if (!window.confirm(t('syncRules.deleteConfirm', {name: ruleLabel(rule)}))) return;
    void persistRules(rules.value.filter(item => item.id !== rule.id));
  };

  const ruleLabel = (rule: SyncRule) =>
    rule.kind === 'tag' ? `#${rule.value}` : rule.value || t('syncRules.wholeVault');

  const openConflict = (conflict: SyncConflictItem) => {
    activeConflict.value = conflict;
    conflictOpen.value = true;
  };

  const resolveConflict = async (choice: 'overwrite' | 'keep') => {
    const conflict = activeConflict.value;
    if (!conflict) return;
    resolving.value = true;
    try {
      await engine.resolveConflict(conflict.path, choice);
      conflictOpen.value = false;
    } catch (error) {
      state.error = (error as Error)?.message || t('syncRules.failed');
    } finally {
      resolving.value = false;
    }
  };

  const openNote = (path: string) => void plugin.app.workspace.openLinkText(path, '', false);
  const upgrade = () => void plugin.api.openClientSetting(CLIENT_SETTING_PAGES.subscribe).catch(() => undefined);

  // The vault is only scanned when the sync page is opened, never during Obsidian startup.
  onMounted(() => {
    if (hasRules.value && !state.scannedAt && !busy.value) void engine.scan();
  });
</script>

<template>
  <section class="wm2-section wm2-sync-rules">
    <h4 class="wm2-section-title">
      <span>{{ t('syncRules.title') }}</span>
      <span class="wm2-chip">{{ t('syncRules.oneWayBadge') }}</span>
    </h4>

    <template v-if="hasRules">
      <div class="wm2-sync-stats is-four">
        <article class="wm2-card wm2-sync-stat">
          <span class="wm2-sync-stat-label wm2-truncate">{{ t('syncRules.synced') }}</span>
          <strong class="wm2-tabular">{{ state.counts.synced }}</strong>
        </article>
        <article class="wm2-card wm2-sync-stat" :class="{'is-current': state.counts.changed}">
          <span class="wm2-sync-stat-label wm2-truncate">{{ t('syncRules.changed') }}</span>
          <strong class="wm2-tabular">{{ state.counts.changed }}</strong>
        </article>
        <article class="wm2-card wm2-sync-stat" :class="{'is-alert': state.conflicts.length}">
          <span class="wm2-sync-stat-label wm2-truncate">{{ t('syncRules.conflicts') }}</span>
          <strong class="wm2-tabular">{{ state.conflicts.length }}</strong>
        </article>
        <article class="wm2-card wm2-sync-stat">
          <span class="wm2-sync-stat-label wm2-truncate">{{ t('syncRules.held') }}</span>
          <strong class="wm2-tabular">{{ state.counts.held }}</strong>
        </article>
      </div>

      <div class="wm2-row wm2-sync-rules-actions">
        <button class="wm2-btn is-sm" type="button" :disabled="busy" @click="engine.scan()">
          <ArrowPathIcon class="wm-icon" />
          {{ t('syncRules.check') }}
        </button>
        <button v-if="!busy" class="wm2-btn is-primary is-sm" type="button" @click="engine.sync()">
          <ArrowUpTrayIcon class="wm-icon" />
          {{ t('syncRules.syncNow', {count: state.counts.changed}) }}
        </button>
        <button v-else class="wm2-btn is-sm" type="button" @click="engine.cancel()">
          <StopIcon class="wm-icon" />
          {{ t('syncRules.cancel') }}
        </button>
      </div>

      <section v-if="busy" class="wm2-card wm2-sync-running" role="status" aria-live="polite">
        <div class="wm2-sync-running-head">
          <span class="wm2-spinner"></span>
          <div class="wm2-list-main">
            <strong>{{ t(state.phase === 'scanning' ? 'syncRules.scanning' : 'syncRules.uploading') }}</strong>
          </div>
          <span v-if="state.run.total" class="wm2-sync-running-count wm2-tabular"
            >{{ state.run.done }} / {{ state.run.total }}</span
          >
        </div>
        <progress
          class="wm2-sync-progress"
          :class="{'is-indeterminate': !state.run.total}"
          :max="100"
          :value="percent"
        ></progress>
      </section>

      <div v-if="state.quotaBlocked" class="wm2-sync-alert" role="alert">
        <ExclamationTriangleIcon class="wm-icon" />
        <span class="wm2-sync-alert-text">{{ t('syncRules.quotaReached') }}</span>
        <button class="wm2-btn is-xs" type="button" @click="upgrade">{{ t('capability.upgrade') }}</button>
      </div>
      <div v-if="state.error && !busy && !state.failures.length" class="wm2-sync-alert is-error" role="alert">
        <ExclamationTriangleIcon class="wm-icon" />
        <span class="wm2-sync-alert-text">{{ state.error }}</span>
      </div>
      <small v-if="lastRunText && !busy" class="wm2-muted wm2-sync-rules-last">{{ lastRunText }}</small>

      <template v-if="state.failures.length && !busy">
        <h5 class="wm2-sync-rules-subtitle wm2-row">
          <span>{{ t('syncRules.failedTitle', {count: state.failures.length}) }}</span>
          <button class="wm2-btn is-ghost is-xs" type="button" @click="engine.retryFailed()">
            <ArrowPathIcon class="wm-icon" />
            {{ t('syncRules.retryFailed') }}
          </button>
        </h5>
        <ul class="wm2-card wm2-list-card">
          <li
            v-for="item in visibleFailures"
            :key="item.path"
            class="wm2-list-row is-clickable"
            role="button"
            tabindex="0"
            @click="openNote(item.path)"
            @keydown.enter="openNote(item.path)"
          >
            <span class="wm2-tile is-error"><ExclamationTriangleIcon class="wm-icon" /></span>
            <div class="wm2-list-main">
              <strong class="wm2-truncate">{{ item.title }}</strong>
              <small class="wm2-muted wm2-truncate" :title="item.message">{{ item.message }}</small>
            </div>
          </li>
        </ul>
      </template>

      <ul v-if="state.conflicts.length" class="wm2-card wm2-list-card">
        <li v-for="conflict in state.conflicts" :key="conflict.path" class="wm2-list-row">
          <span class="wm2-tile is-warning"><ExclamationTriangleIcon class="wm-icon" /></span>
          <div class="wm2-list-main">
            <strong class="wm2-truncate">{{ conflict.title }}</strong>
            <small class="wm2-muted wm2-truncate">{{ t('syncRules.conflictRow') }}</small>
          </div>
          <button class="wm2-btn is-xs" type="button" @click="openConflict(conflict)">
            {{ t('syncRules.compare') }}
          </button>
        </li>
      </ul>

      <div v-if="state.counts.held" class="wm2-row wm2-sync-rules-held">
        <small class="wm2-muted">{{ t('syncRules.heldHint', {count: state.counts.held}) }}</small>
        <button class="wm2-btn is-link is-xs" type="button" :disabled="busy" @click="engine.restoreHeld()">
          {{ t('syncRules.restoreHeld') }}
        </button>
      </div>

      <template v-if="state.pending.length">
        <h5 class="wm2-sync-rules-subtitle">{{ t('syncRules.pendingTitle', {count: state.counts.changed}) }}</h5>
        <ul class="wm2-card wm2-list-card">
          <li
            v-for="item in visiblePending"
            :key="item.path"
            class="wm2-list-row is-clickable"
            role="button"
            tabindex="0"
            @click="openNote(item.path)"
            @keydown.enter="openNote(item.path)"
          >
            <div class="wm2-list-main">
              <strong class="wm2-truncate">{{ item.title }}</strong>
              <small class="wm2-muted wm2-truncate">{{ item.path }}</small>
            </div>
            <span class="wm2-chip" :class="item.kind === 'new' ? 'is-success' : 'is-info'">{{
              t(item.kind === 'new' ? 'syncRules.kindNew' : 'syncRules.kindChanged')
            }}</span>
          </li>
        </ul>
        <button
          v-if="state.pending.length > PENDING_VISIBLE"
          class="wm2-btn is-link is-xs"
          type="button"
          @click="showAllPending = !showAllPending"
        >
          {{ t(showAllPending ? 'syncRules.showLess' : 'syncRules.showAll', {count: state.pending.length}) }}
        </button>
      </template>
    </template>

    <h5 class="wm2-sync-rules-subtitle wm2-row">
      <span>{{ t('syncRules.rulesTitle') }}</span>
      <button class="wm2-btn is-ghost is-xs" type="button" @click="openRule(null)">
        <PlusIcon class="wm-icon" />
        {{ t('syncRules.newRule') }}
      </button>
    </h5>
    <ul v-if="rules.length" class="wm2-card wm2-list-card">
      <li v-for="rule in rules" :key="rule.id" class="wm2-list-row" :class="{'is-muted': !rule.enabled}">
        <span class="wm2-tile">
          <HashtagIcon v-if="rule.kind === 'tag'" class="wm-icon" />
          <FolderIcon v-else class="wm-icon" />
        </span>
        <div class="wm2-list-main">
          <strong class="wm2-truncate" :title="ruleLabel(rule)">{{ ruleLabel(rule) }}</strong>
          <small class="wm2-muted wm2-truncate">
            {{ t(rule.trigger === 'auto' ? 'syncRules.triggerAuto' : 'syncRules.triggerManual') }}
            · {{ t('syncRules.myFiles') }}<template v-if="rule.knowledgeBaseNames.length">
              + {{ rule.knowledgeBaseNames.join(', ') }}</template
            >
          </small>
        </div>
        <RekaSwitch
          :model-value="rule.enabled"
          :aria-label="t('syncRules.enableRule')"
          @update:model-value="value => toggleRule(rule, value)"
        />
        <WmTooltip :content="t('syncRules.editRule')">
          <button class="wm2-icon-btn is-sm" type="button" @click="openRule(rule)">
            <span class="wm-visually-hidden">{{ t('syncRules.editRule') }}</span>
            <PencilSquareIcon class="wm-icon" />
          </button>
        </WmTooltip>
        <WmTooltip :content="t('syncPage.delete')">
          <button class="wm2-icon-btn is-sm" type="button" @click="removeRule(rule)">
            <span class="wm-visually-hidden">{{ t('syncPage.delete') }}</span>
            <TrashIcon class="wm-icon" />
          </button>
        </WmTooltip>
      </li>
    </ul>
    <div v-else class="wm2-card wm2-empty is-compact">
      <ArrowUpTrayIcon class="wm2-empty-icon" />
      <p>{{ t('syncRules.emptyTitle') }}</p>
      <p class="wm2-muted">{{ t('syncRules.emptyDesc') }}</p>
      <button class="wm2-btn is-primary is-sm" type="button" @click="openRule(null)">
        <PlusIcon class="wm-icon" />
        {{ t('syncRules.newRule') }}
      </button>
    </div>
  </section>

  <SyncRuleDialog v-model:open="ruleDialogOpen" :rule="editingRule" @save="saveRule" />
  <SyncConflictDialog
    v-model:open="conflictOpen"
    :conflict="activeConflict"
    :busy="resolving"
    @resolve="resolveConflict"
  />
</template>
