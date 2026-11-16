<script setup lang="ts">
  import {ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {ChevronRightIcon, ClockIcon, ListBulletIcon, MicrophoneIcon} from '@heroicons/vue/24/outline';

  import {usePlugin} from '../../../composables/usePlugin';
  import type {TranscriptionHistoryItem} from '../../../types';
  import WmDialog from '../../WmDialog.vue';

  import {formatDuration, formatRecordDate} from './format';

  defineProps<{currentRecordId: string; isActive: boolean; openingRecords: boolean}>();
  const open = defineModel<boolean>('open', {required: true});
  const emit = defineEmits<{select: [item: TranscriptionHistoryItem]; openAllRecords: []}>();
  const plugin = usePlugin();
  const {t} = useI18n();
  const historyItems = ref<TranscriptionHistoryItem[]>([...plugin.settings.transcriptionHistory]);

  watch(open, isOpen => {
    if (!isOpen) return;
    historyItems.value = [...(plugin.settings.transcriptionHistory || [])].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  });
</script>

<template>
  <WmDialog
    v-model:open="open"
    :title="t('transcription.historyTitle')"
    :description="t('transcription.historyDesc')"
    content-class="wm2-rec-dialog"
  >
    <ul v-if="historyItems.length" class="wm2-card wm2-list-card wm2-rec-dialog-list">
      <li v-for="item in historyItems" :key="item.id" class="wm2-rec-history-row">
        <button
          class="wm2-plain-button wm2-rec-history-item"
          :class="{'is-current': item.id === currentRecordId}"
          type="button"
          :title="isActive ? t('transcription.errors.alreadyActive') : item.title"
          :aria-current="item.id === currentRecordId ? 'true' : undefined"
          :disabled="isActive"
          @click="emit('select', item)"
        >
          <span class="wm2-tile" aria-hidden="true">
            <MicrophoneIcon class="wm-icon" />
          </span>
          <span class="wm2-list-main">
            <strong class="wm2-truncate">{{ item.title }}</strong>
            <small class="wm2-muted wm2-tabular wm2-truncate">
              {{ formatRecordDate(item.createdAt) }} · {{ formatDuration(item.durationMs) }} ·
              {{ t('transcription.historyWordCount', {count: item.wordCount}) }}
            </small>
          </span>
          <span class="wm2-chip" :class="{'is-success': item.summary}">
            {{ item.summary ? t('transcription.summaryView') : t('transcription.transcriptView') }}
          </span>
          <ChevronRightIcon class="wm-icon wm2-rec-chevron" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <div v-else class="wm2-empty is-compact wm2-rec-history-empty">
      <span class="wm2-tile" aria-hidden="true"><ClockIcon class="wm-icon" /></span>
      <p>{{ t('transcription.historyEmpty') }}</p>
      <button
        class="wm2-btn is-ghost is-sm"
        type="button"
        :disabled="openingRecords"
        @click="emit('openAllRecords')"
      >
        <span v-if="openingRecords" class="wm2-spinner"></span>
        <ListBulletIcon v-else class="wm-icon" />
        {{ t('transcription.viewAllRecords') }}
      </button>
    </div>
  </WmDialog>
</template>
