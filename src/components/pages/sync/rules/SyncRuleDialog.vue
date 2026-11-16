<script setup lang="ts">
  import {computed, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {ArrowRightIcon, CheckIcon, XMarkIcon} from '@heroicons/vue/24/outline';

  import {usePlugin} from '../../../../composables/usePlugin';
  import {FEATURES} from '../../../../features';
  import {hasFeature} from '../../../../services/capabilities';
  import {normalizeFolder, normalizeTag, remainingQuota} from '../../../../sync/syncRules';
  import type {SyncRule, SyncRuleKind, SyncRuleTrigger} from '../../../../types';
  import RekaSelect from '../../../RekaSelect.vue';
  import RekaSwitch from '../../../RekaSwitch.vue';
  import WmDialog from '../../../WmDialog.vue';

  type Topic = {id: number; name: string};

  const props = defineProps<{
    open: boolean;
    rule: SyncRule | null;
  }>();

  const emit = defineEmits<{
    'update:open': [value: boolean];
    save: [rule: SyncRule];
  }>();

  const {t} = useI18n();
  const plugin = usePlugin();

  const kind = ref<SyncRuleKind>('folder');
  const value = ref('');
  const includeSubfolders = ref(true);
  const keepFolderInSync = ref(true);
  const autoJoinByTag = ref(true);
  const trigger = ref<SyncRuleTrigger>('auto');
  const topicIds = ref<number[]>([]);
  const topics = ref<Topic[]>([]);
  const folders = ref<string[]>([]);
  const tags = ref<string[]>([]);
  const quota = ref<{used: number; limit: number} | null>(null);

  const kindOptions = computed(() => [
    {value: 'folder', label: t('syncRules.kindFolder')},
    {value: 'tag', label: t('syncRules.kindTag')},
  ]);
  const triggerOptions = computed(() => [
    {value: 'auto', label: t('syncRules.triggerAuto')},
    {value: 'manual', label: t('syncRules.triggerManual')},
  ]);
  // Reka Select rejects an empty item value, so the whole-vault choice uses a sentinel.
  const WHOLE_VAULT_VALUE = '__wm_whole_vault__';
  const sourceOptions = computed(() => {
    const current = kind.value === 'folder' ? normalizeFolder(value.value) : normalizeTag(value.value);
    const listed = kind.value === 'folder' ? folders.value : tags.value;
    const values = [...new Set(listed)].filter(Boolean).sort();
    const limited = values.slice(0, 200);
    if (current && !limited.includes(current)) limited.push(current);
    if (kind.value === 'folder') {
      return [
        {value: WHOLE_VAULT_VALUE, label: t('syncRules.wholeVault')},
        ...limited.map(item => ({value: item, label: item})),
      ];
    }
    return limited.map(item => ({value: item, label: `#${item}`}));
  });
  const sourceValue = computed(() => {
    if (kind.value === 'folder' && !normalizeFolder(value.value)) return WHOLE_VAULT_VALUE;
    return value.value;
  });
  const canSave = computed(() => kind.value === 'folder' || Boolean(normalizeTag(value.value)));
  const showTopics = computed(() => hasFeature(FEATURES.topics) && hasFeature(FEATURES.upsertTopics));

  /** Vault folders and tags come from Obsidian's in-memory caches; nothing is read from disk. */
  const loadVaultOptions = () => {
    const folderSet = new Set<string>();
    const tagSet = new Set<string>();
    for (const file of plugin.app.vault.getMarkdownFiles()) {
      if (file.parent?.path && file.parent.path !== '/') folderSet.add(file.parent.path);
      const cache = plugin.app.metadataCache.getFileCache(file);
      cache?.tags?.forEach(item => tagSet.add(normalizeTag(item.tag)));
      [cache?.frontmatter?.tags].flat().filter(Boolean).forEach(tag => tagSet.add(normalizeTag(String(tag))));
    }
    folders.value = [...folderSet].sort();
    tags.value = [...tagSet].filter(Boolean).sort();
  };

  const loadRemote = async () => {
    if (!plugin.connected) return;
    if (showTopics.value) {
      try {
        const bases = await plugin.api.listKnowledgeBases();
        topics.value = (Array.isArray(bases) ? bases : [])
          .map((base: {id?: unknown; name?: unknown}) => ({id: Number(base.id), name: String(base.name || '')}))
          .filter(base => base.id > 0 && base.name);
      } catch {
        topics.value = [];
      }
    }
    if (hasFeature(FEATURES.usage)) {
      try {
        const usage = await plugin.api.getAccountUsage();
        const item = usage?.items?.find(entry => entry.key === 'fileCount');
        const remaining = remainingQuota(usage);
        quota.value = item && item.limit !== null && remaining !== null ? {used: item.usage, limit: item.limit} : null;
      } catch {
        quota.value = null;
      }
    }
  };

  watch(
    () => props.open,
    open => {
      if (!open) return;
      const rule = props.rule;
      kind.value = rule?.kind || 'folder';
      value.value = rule?.value || '';
      includeSubfolders.value = rule?.includeSubfolders ?? true;
      keepFolderInSync.value = rule?.keepFolderInSync ?? true;
      autoJoinByTag.value = rule?.autoJoinByTag ?? true;
      trigger.value = rule?.trigger || 'auto';
      topicIds.value = [...(rule?.knowledgeBaseIds || [])];
      loadVaultOptions();
      void loadRemote();
    },
    {immediate: true},
  );

  const setKind = (next: string) => {
    if (next === kind.value) return;
    kind.value = next === 'tag' ? 'tag' : 'folder';
    value.value = '';
  };
  const setTrigger = (next: string) => {
    trigger.value = next === 'manual' ? 'manual' : 'auto';
  };
  const setSource = (next: string) => {
    value.value = next === WHOLE_VAULT_VALUE ? '' : next;
  };

  const topicOptions = computed(() => topics.value.map(topic => ({value: String(topic.id), label: topic.name})));
  const selectedTopicIds = computed(() => topicIds.value.map(id => String(id)));
  const setTopics = (next: string[]) => {
    topicIds.value = next.map(id => Number(id)).filter(id => Number.isFinite(id) && id > 0);
  };

  const save = () => {
    if (!canSave.value) return;
    const ids = showTopics.value ? topicIds.value : [];
    emit('save', {
      id: props.rule?.id || `rule-${Date.now().toString(36)}`,
      kind: kind.value,
      value: kind.value === 'folder' ? normalizeFolder(value.value) : normalizeTag(value.value),
      includeSubfolders: includeSubfolders.value,
      keepFolderInSync: kind.value === 'folder' ? keepFolderInSync.value : undefined,
      autoJoinByTag: kind.value === 'tag' ? autoJoinByTag.value : undefined,
      trigger: trigger.value,
      knowledgeBaseIds: ids,
      knowledgeBaseNames: ids.map(id => topics.value.find(topic => topic.id === id)?.name || String(id)),
      enabled: props.rule?.enabled ?? true,
      createdAt: props.rule?.createdAt || Date.now(),
    });
  };
</script>

<template>
  <WmDialog
    :open="open"
    :title="t(rule ? 'syncRules.editRule' : 'syncRules.newRule')"
    :description="t('syncRules.ruleDialogDesc')"
    content-class="wm2-sync-dialog"
    @update:open="emit('update:open', $event)"
  >
    <div class="wm2-sync-rule-form">
      <label class="wm2-sync-field">
        <span class="wm2-muted">{{ t('syncRules.source') }}</span>
        <RekaSelect :model-value="kind" :options="kindOptions" @update:model-value="setKind" />
      </label>
      <label class="wm2-sync-field">
        <span class="wm2-muted">{{ t(kind === 'folder' ? 'syncRules.folderLabel' : 'syncRules.tagLabel') }}</span>
        <RekaSelect
          :model-value="sourceValue"
          :options="sourceOptions"
          :placeholder="t(kind === 'folder' ? 'syncRules.folderPlaceholder' : 'syncRules.tagPlaceholder')"
          @update:model-value="setSource"
        />
      </label>
      <div v-if="kind === 'folder'" class="wm2-sync-field is-inline">
        <span>{{ t('syncRules.includeSubfolders') }}</span>
        <RekaSwitch v-model="includeSubfolders" :aria-label="t('syncRules.includeSubfolders')" />
      </div>
      <label class="wm2-sync-field">
        <span class="wm2-muted">{{ t('syncRules.trigger') }}</span>
        <RekaSelect :model-value="trigger" :options="triggerOptions" @update:model-value="setTrigger" />
      </label>

      <div class="wm2-sync-field">
        <span class="wm2-muted">{{ t('syncRules.target') }}</span>
        <div class="wm2-sync-rule-target">
          <span class="wm2-chip is-info">{{ t('syncRules.myFiles') }}</span>
          <ArrowRightIcon v-if="topicIds.length" class="wm-icon" />
          <span v-for="id in topicIds" :key="id" class="wm2-chip is-success">{{
            topics.find(topic => topic.id === id)?.name || id
          }}</span>
        </div>
      </div>
      <div v-if="showTopics && topics.length" class="wm2-sync-field">
        <span class="wm2-muted">{{ t('syncRules.addToTopics') }}</span>
        <RekaSelect
          multiple
          :model-value="selectedTopicIds"
          :options="topicOptions"
          :placeholder="t('common.select')"
          @update:model-value="setTopics"
        />
      </div>

      <Transition name="wm2-collapse">
        <div v-if="showTopics && topicIds.length" class="wm2-sync-rule-advanced">
          <div class="wm2-muted">{{ t('syncRules.topicStrategy') }}</div>
          <label class="wm2-sync-choice is-active">
            <input type="radio" checked disabled />
            <span>
              <strong>{{ t('syncRules.topicJoinOnly') }}</strong>
              <small class="wm2-muted">{{ t('syncRules.topicJoinOnlyDesc') }}</small>
            </span>
          </label>
          <label v-if="kind === 'folder'" class="wm2-sync-field is-check">
            <input v-model="keepFolderInSync" type="checkbox" />
            <span>
              <strong>{{ t('syncRules.keepFolderInSync') }}</strong>
              <small class="wm2-muted">{{ t('syncRules.keepFolderInSyncDesc') }}</small>
            </span>
          </label>
          <template v-if="kind === 'tag'">
            <p class="wm2-sync-alert is-info" role="note">{{ t('syncRules.tagAutoJoinHint') }}</p>
            <label class="wm2-sync-field is-check">
              <input v-model="autoJoinByTag" type="checkbox" />
              <span>
                <strong>{{ t('syncRules.autoJoinByTag') }}</strong>
                <small class="wm2-muted">{{ t('syncRules.autoJoinByTagDesc') }}</small>
              </span>
            </label>
          </template>
        </div>
      </Transition>

      <p class="wm2-muted wm2-sync-rule-hint">{{ t('syncRules.oneWayHint') }}</p>
      <p v-if="quota" class="wm2-muted wm2-sync-rule-hint">
        {{ t('syncRules.quotaHint', {used: quota.used, limit: quota.limit}) }}
      </p>
    </div>
    <footer class="wm2-dialog-actions">
      <button class="wm2-btn is-sm" type="button" @click="emit('update:open', false)">
        <XMarkIcon class="wm-icon" />
        {{ t('syncPage.cancel') }}
      </button>
      <button class="wm2-btn is-primary is-sm" type="button" :disabled="!canSave" @click="save">
        <CheckIcon class="wm-icon" />
        {{ t('syncPage.save') }}
      </button>
    </footer>
  </WmDialog>
</template>
