<script setup lang="ts">
  import {computed} from 'vue';
  import {useI18n} from 'vue-i18n';

  import {useSyncState} from './syncState';

  const emit = defineEmits<{
    openHistory: [];
  }>();

  const {t} = useI18n();
  const {
    plugin,
    direction,
    initialLoading,
    obsidianItems,
    wiseMindItems,
    snapshot,
    selectedObsidian,
    settingsRevision,
  } = useSyncState();

  const stats = computed(() => {
    const markdownKnowledgeBases = new Set(
      wiseMindItems.value
        .filter(item => item.sourceType === 'knowledge-document')
        .map(item => item.knowledgeBaseName || '')
        .filter(Boolean),
    );
    return {
      obsidian: obsidianItems.value.length,
      notes: wiseMindItems.value.filter(item => item.sourceType === 'note').length,
      documents: wiseMindItems.value.filter(item => item.sourceType === 'document').length,
      knowledge: markdownKnowledgeBases.size || snapshot.value?.knowledgeBases?.length || 0,
    };
  });

  const lastSync = computed(
    () => (settingsRevision.value, plugin.settings.syncHistory?.[0] || null),
  );
  const lastSyncTotal = computed(() => {
    const history = lastSync.value;
    return history ? history.created + history.updated + history.skipped + history.failed : 0;
  });
  const formatTime = (time: number) =>
    new Date(time).toLocaleString(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
</script>

<template>
  <div class="wm2-sync-stats">
    <article class="wm2-card wm2-sync-stat" :class="{'is-current': direction === 'to-wisemind'}">
      <span class="wm2-sync-stat-label wm2-truncate">{{ t('syncPage.obsidianVault') }}</span>
      <span v-if="initialLoading" class="wm2-sync-skeleton is-value"></span>
      <strong v-else class="wm2-tabular">{{ stats.obsidian }}</strong>
      <span class="wm2-sync-stat-status is-brand">
        <i class="wm2-sync-dot"></i>
        <span class="wm2-truncate">{{
          t('syncPage.selectedNotesShort', {count: selectedObsidian.size})
        }}</span>
      </span>
    </article>
    <article
      class="wm2-card wm2-sync-stat"
      :class="{'is-current': direction === 'to-obsidian'}"
      :title="`${t('syncPage.notesCount', {count: stats.notes})} · ${t('syncPage.documentsCount', {count: stats.documents})}`"
    >
      <span class="wm2-sync-stat-label wm2-truncate">{{ t('common.appName') }}</span>
      <span v-if="initialLoading" class="wm2-sync-skeleton is-value"></span>
      <strong v-else class="wm2-tabular">{{ stats.notes + stats.documents }}</strong>
      <span class="wm2-sync-stat-status is-info">
        <i class="wm2-sync-dot"></i>
        <span class="wm2-truncate">{{
          t('syncPage.knowledgeBasesCount', {count: stats.knowledge})
        }}</span>
      </span>
    </article>
    <button
      v-if="lastSync"
      class="wm2-plain-button wm2-card wm2-sync-stat is-clickable"
      :class="{'is-alert': lastSync.failed}"
      type="button"
      :title="`${formatTime(lastSync.createdAt)} · ${t('syncPage.history')}`"
      @click="emit('openHistory')"
    >
      <span class="wm2-sync-stat-label wm2-truncate">{{ t('syncPage.lastSync') }}</span>
      <strong class="wm2-tabular">{{ lastSyncTotal }}</strong>
      <span class="wm2-sync-stat-status" :class="lastSync.failed ? 'is-error' : 'is-success'">
        <i class="wm2-sync-dot"></i>
        <span class="wm2-truncate wm2-tabular">{{
          lastSync.failed
            ? t('syncPage.failedCount', {count: lastSync.failed})
            : formatTime(lastSync.createdAt)
        }}</span>
      </span>
    </button>
    <article v-else class="wm2-card wm2-sync-stat">
      <span class="wm2-sync-stat-label wm2-truncate">{{ t('syncPage.lastSync') }}</span>
      <strong class="wm2-tabular wm2-sync-faint">-</strong>
      <span class="wm2-sync-stat-status">
        <i class="wm2-sync-dot"></i>
        <span class="wm2-truncate">{{ t('syncPage.noSyncYet') }}</span>
      </span>
    </article>
  </div>
</template>
