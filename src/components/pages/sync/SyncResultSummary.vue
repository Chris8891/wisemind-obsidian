<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {ArrowPathIcon, ArrowRightIcon, ChevronRightIcon} from '@heroicons/vue/24/outline';

  import SyncResultTiles from './SyncResultTiles.vue';
  import {useSyncState} from './syncState';

  const {t} = useI18n();
  const {
    resultDialogOpen,
    selectedSyncHistory,
    selectedSyncHistoryRows,
    resultTiles,
    retryableFailedCount,
    retryFailed,
  } = useSyncState();
</script>

<template>
  <section class="wm2-section">
    <h4 class="wm2-section-title">
      <span>{{
        selectedSyncHistory ? t('syncPage.historyContentTitle') : t('syncPage.resultTitle')
      }}</span>
      <span class="wm2-sync-section-actions">
        <button
          v-if="retryableFailedCount"
          class="wm2-btn is-ghost is-xs wm2-sync-retry"
          type="button"
          @click="retryFailed"
        >
          <ArrowPathIcon class="wm-icon" />
          {{ t('syncPage.retryFailed', {count: retryableFailedCount}) }}
        </button>
        <button class="wm2-btn is-ghost is-xs" type="button" @click="resultDialogOpen = true">
          {{ t('syncPage.viewDetails') }}
          <ChevronRightIcon class="wm-icon" />
        </button>
      </span>
    </h4>
    <div class="wm2-card wm2-sync-result">
      <p v-if="selectedSyncHistory" class="wm2-sync-route">
        <span class="wm2-truncate">{{ selectedSyncHistory.sourceLabel }}</span>
        <ArrowRightIcon class="wm-icon" />
        <span class="wm2-truncate">{{ selectedSyncHistory.targetLabel }}</span>
      </p>
      <SyncResultTiles :tiles="resultTiles" />
      <ul v-if="selectedSyncHistory" class="wm2-sync-detail-list">
        <li
          v-for="(item, index) in selectedSyncHistoryRows"
          :key="`${item.title}:${index}`"
          :title="`${item.title} → ${item.target}`"
        >
          <span class="wm2-truncate">{{ item.title }}</span>
          <ArrowRightIcon class="wm-icon" />
          <small class="wm2-truncate">{{ item.target }}</small>
        </li>
      </ul>
    </div>
  </section>
</template>
