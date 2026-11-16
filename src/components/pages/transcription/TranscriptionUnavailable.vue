<script setup lang="ts">
  import {computed} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {ArrowPathIcon, ExclamationTriangleIcon} from '@heroicons/vue/24/outline';

  import {MINIMUM_TRANSCRIPTION_VERSION} from '../../../services/transcriptionAvailability';

  import TranscriptionRecordLinks from './TranscriptionRecordLinks.vue';
  import {injectTranscriptionSetup} from './useTranscriptionSetup';

  defineProps<{openingRecords: boolean}>();
  const emit = defineEmits<{openHistory: []; openAllRecords: []}>();
  const {t} = useI18n();
  const {setupStatus, loading, loadSetup} = injectTranscriptionSetup();

  const setupMessage = computed(() => {
    if (setupStatus.value === 'checking') {
      return {
        title: t('transcription.compatibility.checkingTitle'),
        description: t('transcription.compatibility.checkingDesc'),
      };
    }
    if (setupStatus.value === 'not-running') {
      return {
        title: t('transcription.compatibility.notRunningTitle'),
        description: t('transcription.compatibility.notRunningDesc'),
      };
    }
    if (setupStatus.value === 'unsupported') {
      return {
        title: t('transcription.compatibility.unsupportedTitle'),
        description: t('transcription.compatibility.unsupportedDesc', {
          version: MINIMUM_TRANSCRIPTION_VERSION,
        }),
      };
    }
    return {
      title: t('transcription.compatibility.unavailableTitle'),
      description: t('transcription.compatibility.unavailableDesc'),
    };
  });
</script>

<template>
  <div class="wm2-rec-body">
    <div class="wm2-empty">
      <span v-if="setupStatus === 'checking'" class="wm2-spinner wm2-rec-spinner-lg"></span>
      <span v-else class="wm2-rec-result-icon is-warning">
        <ExclamationTriangleIcon class="wm-icon" />
      </span>
      <strong>{{ setupMessage.title }}</strong>
      <p class="wm2-muted">{{ setupMessage.description }}</p>
      <button
        v-if="setupStatus !== 'checking'"
        class="wm2-btn is-primary is-sm"
        type="button"
        :disabled="loading"
        :aria-busy="loading"
        @click="loadSetup(false)"
      >
        <ArrowPathIcon class="wm-icon" :class="{'wm2-spin': loading}" />
        {{ t('common.retry') }}
      </button>
    </div>
  </div>
  <footer class="wm2-rec-footer">
    <TranscriptionRecordLinks
      :opening-records="openingRecords"
      @open-history="emit('openHistory')"
      @open-all-records="emit('openAllRecords')"
    />
  </footer>
</template>
