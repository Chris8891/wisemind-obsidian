<script setup lang="ts">
  import {computed, onMounted, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {ArrowPathIcon, ExclamationTriangleIcon, ListBulletIcon} from '@heroicons/vue/24/outline';
  import {Notice} from 'obsidian';

  import {usePlugin} from '../../composables/usePlugin';
  import type {TranscriptionHistoryItem} from '../../types';

  import TranscriptionHistory from './transcription/TranscriptionHistory.vue';
  import TranscriptionLive from './transcription/TranscriptionLive.vue';
  import TranscriptionResult from './transcription/TranscriptionResult.vue';
  import TranscriptionSetup from './transcription/TranscriptionSetup.vue';
  import TranscriptionUnavailable from './transcription/TranscriptionUnavailable.vue';
  import {useActiveMarkdownFile} from './transcription/useActiveMarkdownFile';
  import {useTranscriptionActions} from './transcription/useTranscriptionActions';
  import {provideTranscriptionSetup} from './transcription/useTranscriptionSetup';

  const plugin = usePlugin();
  const {t} = useI18n();
  const controller = plugin.transcription;
  const state = controller.state;
  const activeNote = useActiveMarkdownFile();
  const {activeMarkdownPath} = activeNote;
  const {setupStatus, loadSetup, resetForm} = provideTranscriptionSetup(activeNote);
  const {runAction, openCurrentRecord} = useTranscriptionActions();

  const openingRecords = ref(false);
  const historyDialogOpen = ref(false);
  const completionView = ref<'transcript' | 'summary'>('transcript');
  let lastCompletionNoticeRecordId = '';

  const isActive = computed(() => controller.isActive);
  const currentRecordId = computed(() => state.completedDetail?.record.id || '');

  const openAllRecords = async () => {
    if (openingRecords.value) return;
    openingRecords.value = true;
    try {
      const opened = await runAction(() => plugin.api.openTranscriptions());
      if (opened !== undefined) {
        new Notice(t('transcription.recordsOpened'));
      }
    } finally {
      openingRecords.value = false;
    }
  };
  const openHistory = () => {
    historyDialogOpen.value = true;
  };
  const showHistoryItem = (item: TranscriptionHistoryItem) => {
    if (!controller.showCachedHistory(item)) return;
    completionView.value = item.summary || item.keyPoints || item.todos ? 'summary' : 'transcript';
    historyDialogOpen.value = false;
  };

  const reset = async () => {
    controller.reset();
    resetForm();
    completionView.value = 'transcript';
    await loadSetup(false);
  };

  watch(
    () => state.status,
    status => {
      if (status !== 'completed') return;
      const recordId = state.completedDetail?.record.id || state.record?.id || '';
      if (recordId && recordId !== lastCompletionNoticeRecordId) {
        lastCompletionNoticeRecordId = recordId;
        new Notice(t('transcription.completedSavedNotice'), 7_000);
      }
    },
    {flush: 'post'},
  );

  onMounted(() => {
    void loadSetup(false);
  });
</script>

<template>
  <section class="wm2-rec">
    <TranscriptionUnavailable
      v-if="state.status === 'idle' && setupStatus !== 'ready'"
      :opening-records="openingRecords"
      @open-history="openHistory"
      @open-all-records="openAllRecords"
    />

    <TranscriptionSetup
      v-else-if="state.status === 'idle'"
      :opening-records="openingRecords"
      @open-history="openHistory"
      @open-all-records="openAllRecords"
    />

    <TranscriptionLive v-else-if="isActive" />

    <TranscriptionResult
      v-else-if="state.status === 'completed' && state.completedDetail"
      v-model:view="completionView"
      :detail="state.completedDetail"
      :active-markdown-path="activeMarkdownPath"
      @open-history="openHistory"
      @new-recording="reset"
    />

    <template v-else-if="state.status === 'error'">
      <div class="wm2-rec-body">
        <div class="wm2-empty">
          <span class="wm2-rec-result-icon is-error">
            <ExclamationTriangleIcon class="wm-icon" />
          </span>
          <strong>{{ t('transcription.failed') }}</strong>
          <p class="wm2-muted wm2-rec-error-desc">{{ state.error || t('transcription.errors.unknown') }}</p>
        </div>
      </div>
      <footer class="wm2-rec-footer">
        <button class="wm2-btn is-ghost is-sm" type="button" @click="openCurrentRecord">
          <ListBulletIcon class="wm-icon" />
          {{ t('transcription.viewSavedRecord') }}
        </button>
        <span class="wm2-rec-spacer"></span>
        <button class="wm2-btn is-primary is-sm" type="button" @click="reset">
          <ArrowPathIcon class="wm-icon" />
          {{ t('common.retry') }}
        </button>
      </footer>
    </template>

    <TranscriptionHistory
      v-model:open="historyDialogOpen"
      :current-record-id="currentRecordId"
      :is-active="isActive"
      :opening-records="openingRecords"
      @select="showHistoryItem"
      @open-all-records="openAllRecords"
    />
  </section>
</template>
