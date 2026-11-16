<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {SparklesIcon} from '@heroicons/vue/24/outline';

  import type {TranscriptionRecord} from '../../../types';
  import MarkdownView from '../../MarkdownView.vue';

  defineProps<{
    record: TranscriptionRecord;
    organizing: boolean;
    hasGeneratedSummary: boolean;
    hasCompletedTranscript: boolean;
  }>();
  const emit = defineEmits<{generate: []}>();
  const {t} = useI18n();
</script>

<template>
  <section class="wm2-card wm2-rec-summary" role="tabpanel" :aria-busy="organizing">
    <div v-if="!hasGeneratedSummary" class="wm2-empty is-compact">
      <span class="wm2-tile"><SparklesIcon class="wm-icon" /></span>
      <strong>{{ t('transcription.summaryEmptyTitle') }}</strong>
      <p class="wm2-muted">
        {{
          hasCompletedTranscript
            ? t('transcription.summaryEmptyDesc')
            : t('transcription.summaryNeedsTranscript')
        }}
      </p>
      <button
        class="wm2-btn is-primary is-sm"
        type="button"
        :disabled="organizing || !hasCompletedTranscript"
        @click="emit('generate')"
      >
        <span v-if="organizing" class="wm2-spinner"></span>
        <SparklesIcon v-else class="wm-icon" />
        {{ organizing ? t('transcription.generatingSummary') : t('transcription.generateSummary') }}
      </button>
      <div v-if="organizing" class="wm2-rec-skeleton" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
    <template v-else>
      <article class="wm2-rec-summary-section">
        <h5>{{ t('transcription.noteSections.summary') }}</h5>
        <MarkdownView :markdown="record.summary || ''" />
      </article>
      <article v-if="record.keyPoints" class="wm2-rec-summary-section">
        <h5>{{ t('transcription.noteSections.keyPoints') }}</h5>
        <MarkdownView :markdown="record.keyPoints" />
      </article>
      <article v-if="record.todos" class="wm2-rec-summary-section">
        <h5>{{ t('transcription.noteSections.todos') }}</h5>
        <MarkdownView :markdown="record.todos" />
      </article>
    </template>
  </section>
</template>
