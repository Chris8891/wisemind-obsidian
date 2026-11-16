<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {ArrowPathIcon, ExclamationTriangleIcon, XMarkIcon} from '@heroicons/vue/24/outline';

  import WmDialog from '../../WmDialog.vue';

  import {useSyncState} from './syncState';

  const {t} = useI18n();
  const {running, pendingSyncPreview, previewDialogOpen, confirmExecute} = useSyncState();
</script>

<template>
  <WmDialog
    v-if="pendingSyncPreview"
    v-model:open="previewDialogOpen"
    :title="pendingSyncPreview.title"
    :description="t('syncPage.previewDescription')"
    content-class="wm2-sync-dialog"
  >
    <ul class="wm2-card wm2-list-card wm2-sync-kv">
      <li v-for="(row, index) in pendingSyncPreview.rows" :key="`${row.label}:${row.value}:${index}`">
        <span class="wm2-muted">{{ row.label }}</span>
        <strong class="wm2-truncate">{{ row.value }}</strong>
      </li>
    </ul>
    <div v-if="pendingSyncPreview.warningText" class="wm2-sync-alert" role="alert">
      <ExclamationTriangleIcon class="wm-icon" />
      <span>{{ pendingSyncPreview.warningText }}</span>
    </div>
    <footer class="wm2-dialog-actions">
      <button class="wm2-btn is-sm" type="button" @click="previewDialogOpen = false">
        <XMarkIcon class="wm-icon" />
        {{ t('syncPage.cancel') }}
      </button>
      <button class="wm2-btn is-primary is-sm" type="button" :disabled="running" @click="confirmExecute">
        <span v-if="running" class="wm2-spinner"></span>
        <ArrowPathIcon v-else class="wm-icon" />
        {{ t('syncPage.confirmSync') }}
      </button>
    </footer>
  </WmDialog>
</template>
