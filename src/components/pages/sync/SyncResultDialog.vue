<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {ArrowPathIcon, ArrowRightIcon, XMarkIcon} from '@heroicons/vue/24/outline';

  import WmDialog from '../../WmDialog.vue';

  import SyncResultTiles from './SyncResultTiles.vue';
  import {useSyncState} from './syncState';

  const {t} = useI18n();
  const {
    running,
    result,
    resultDialogOpen,
    resultTiles,
    syncResultGroups,
    retryableFailedCount,
    retryFailed,
    retryFromResult,
  } = useSyncState();
</script>

<template>
  <WmDialog
    v-if="result"
    v-model:open="resultDialogOpen"
    :title="t('syncPage.resultTitle')"
    content-class="wm2-sync-dialog"
  >
    <SyncResultTiles :tiles="resultTiles" boxed />
    <div class="wm2-sync-result-groups">
      <section v-for="group in syncResultGroups" :key="group.status" class="wm2-section">
        <h4 class="wm2-section-title">
          <span>{{ group.label }}</span>
          <span class="wm2-chip wm2-tabular" :class="`is-status-${group.status}`">{{
            group.rows.length
          }}</span>
        </h4>
        <ul class="wm2-card wm2-list-card wm2-sync-detail-card" :class="`is-status-${group.status}`">
          <li
            v-for="(item, index) in group.rows"
            :key="`${group.status}:${item.title}:${index}`"
            :title="`${item.title} → ${item.target}`"
          >
            <div class="wm2-list-main">
              <span class="wm2-sync-detail-line">
                <strong class="wm2-truncate">{{ item.title }}</strong>
                <ArrowRightIcon class="wm-icon" />
                <span class="wm2-muted wm2-truncate">{{ item.target }}</span>
              </span>
              <small v-if="item.message" class="wm2-muted">{{ item.message }}</small>
            </div>
          </li>
        </ul>
      </section>
      <div v-if="!syncResultGroups.length" class="wm2-empty is-compact">
        <p>{{ t('syncPage.noSyncDetails') }}</p>
      </div>
    </div>
    <footer class="wm2-dialog-actions">
      <button class="wm2-btn is-sm" type="button" @click="resultDialogOpen = false">
        <XMarkIcon class="wm-icon" />
        {{ t('syncPage.close') }}
      </button>
      <button
        v-if="retryableFailedCount"
        class="wm2-btn is-primary is-sm"
        type="button"
        :disabled="running"
        @click="retryFailed"
      >
        <ArrowPathIcon class="wm-icon" />
        {{ t('syncPage.retryFailed', {count: retryableFailedCount}) }}
      </button>
      <button
        v-else-if="result.failed"
        class="wm2-btn is-primary is-sm"
        type="button"
        :disabled="running"
        @click="retryFromResult"
      >
        <ArrowPathIcon class="wm-icon" />
        {{ t('syncPage.retry') }}
      </button>
    </footer>
  </WmDialog>
</template>
