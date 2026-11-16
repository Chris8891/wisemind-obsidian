<script setup lang="ts">
  import {computed, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    CheckIcon,
    ClipboardDocumentIcon,
    DocumentTextIcon,
    MicrophoneIcon,
    SparklesIcon,
    UserGroupIcon,
  } from '@heroicons/vue/24/outline';
  import {Notice} from 'obsidian';

  import {useFlashState} from '../../../composables/useFlashState';
  import {usePlugin} from '../../../composables/usePlugin';
  import type {TranscriptionDetail, TranscriptionSegment} from '../../../types';

  import {formatDuration, speakerIdTone} from './format';
  import SpeakerManagerDialog from './SpeakerManagerDialog.vue';
  import TranscriptionResultActions from './TranscriptionResultActions.vue';
  import TranscriptionSummaryPanel from './TranscriptionSummaryPanel.vue';
  import {useCompletedSpeakers, useSpeakerLabels} from './useSpeakers';
  import {useTranscriptionActions} from './useTranscriptionActions';

  const props = defineProps<{detail: TranscriptionDetail; activeMarkdownPath: string}>();
  const completionView = defineModel<'transcript' | 'summary'>('view', {required: true});
  const emit = defineEmits<{openHistory: []; newRecording: []}>();
  const controller = usePlugin().transcription;
  const {t} = useI18n();
  const {runAction} = useTranscriptionActions();
  const {flash, isFlashing} = useFlashState();
  const {segmentSpeakerLabel, speakerTone} = useSpeakerLabels();
  const {completedSpeakers, completedSpeakerKey} = useCompletedSpeakers();

  const organizing = ref(false);
  const speakerDialogOpen = ref(false);
  const assigningSpeakerSegmentId = ref('');
  const speakerFilter = ref('');

  const hasCompletedTranscript = computed(() =>
    props.detail.segments.some(segment => segment.text.trim()),
  );
  const hasGeneratedSummary = computed(() => Boolean(props.detail.record.summary?.trim()));
  const completedTranscript = computed(() => {
    const transcript = props.detail.segments
      .filter(segment => segment.text.trim())
      .map(segment => {
        const speaker = segmentSpeakerLabel(segment);
        return `${formatDuration(segment.beginTimeMs || 0)}${speaker ? `  ${speaker}` : ''}  ${segment.text.trim()}`;
      })
      .join('\n\n');
    return `${props.detail.record.title}\n\n${transcript}`.trim();
  });
  const completedTitle = computed(() =>
    [
      t('transcription.completed'),
      formatDuration(props.detail.record.durationMs),
      t('transcription.historyWordCount', {count: props.detail.record.wordCount}),
    ].join(' · '),
  );
  const visibleCompletedSegments = computed(() => {
    const segments = props.detail.segments;
    if (!speakerFilter.value) return segments;
    return segments.filter(segment => String(segment.speakerId || '') === speakerFilter.value);
  });

  const toggleSpeakerFilter = (speakerId: string) => {
    speakerFilter.value = speakerFilter.value === speakerId ? '' : speakerId;
  };

  const assignCompletedSpeaker = async (segment: TranscriptionSegment, speakerId: string) => {
    if (!speakerId || segment.speakerId === speakerId || assigningSpeakerSegmentId.value) return;
    const speaker = completedSpeakers.value.find(item => item.id === speakerId);
    if (!speaker) return;
    assigningSpeakerSegmentId.value = segment.id;
    try {
      await controller.updateCompletedSpeakers([
        {
          id: segment.id,
          speakerId,
          speakerLabel: speaker.name,
          speakerSource: 'user',
        },
      ]);
      new Notice(t('transcription.speakerAssigned'));
    } catch (error: any) {
      new Notice(error?.message || t('transcription.speakerSaveFailed'));
    } finally {
      assigningSpeakerSegmentId.value = '';
    }
  };

  const organizeCompletedRecord = async () => {
    if (organizing.value || hasGeneratedSummary.value || !hasCompletedTranscript.value) return;
    organizing.value = true;
    try {
      const result = await runAction(() => controller.organizeCompletedRecord());
      if (result) {
        completionView.value = 'summary';
        new Notice(t('transcription.summaryGenerated'));
      }
    } finally {
      organizing.value = false;
    }
  };

  const copyCompletedTranscript = async () => {
    if (!completedTranscript.value) return;
    const copied = await runAction(async () => {
      await navigator.clipboard.writeText(completedTranscript.value);
      return true;
    });
    if (copied) flash('copy');
  };

  watch(
    () => props.detail.record.id,
    () => {
      speakerFilter.value = '';
    },
  );

  watch(completedSpeakers, speakers => {
    if (speakerFilter.value && !speakers.some(speaker => speaker.id === speakerFilter.value)) {
      speakerFilter.value = '';
    }
  });
</script>

<template>
  <div class="wm2-rec-body">
    <div class="wm2-rec-done-hero">
      <span class="wm2-rec-result-icon is-success">
        <CheckIcon class="wm-icon" />
      </span>
      <strong class="wm2-tabular">{{ completedTitle }}</strong>
      <p class="wm2-rec-note">{{ t('transcription.savedToWiseMind') }}</p>
    </div>

    <div class="wm2-rec-done-tabs">
      <div class="wm2-segmented" role="tablist" :aria-label="t('transcription.resultViews')">
        <button
          :class="{'is-active': completionView === 'summary'}"
          type="button"
          role="tab"
          :aria-selected="completionView === 'summary'"
          @click="completionView = 'summary'"
        >
          <span v-if="organizing" class="wm2-spinner"></span>
          <SparklesIcon v-else class="wm-icon" />
          {{
            t(hasGeneratedSummary ? 'transcription.summaryView' : 'transcription.generateSummary')
          }}
        </button>
        <button
          :class="{'is-active': completionView === 'transcript'}"
          type="button"
          role="tab"
          :aria-selected="completionView === 'transcript'"
          @click="completionView = 'transcript'"
        >
          <DocumentTextIcon class="wm-icon" />
          {{ t('transcription.transcriptView') }}
        </button>
      </div>
      <button
        v-if="completionView === 'transcript' && completedSpeakers.length"
        class="wm2-btn is-ghost is-xs"
        type="button"
        :title="t('transcription.manageSpeakers')"
        @click="speakerDialogOpen = true"
      >
        <UserGroupIcon class="wm-icon" />
        {{ t('transcription.identifiedSpeakers', {count: completedSpeakers.length}) }}
      </button>
    </div>

    <div
      v-if="completionView === 'transcript' && completedSpeakers.length > 1"
      class="wm2-rec-speaker-chips"
      role="group"
      :aria-label="t('transcription.speakerFilterHint')"
    >
      <button
        v-for="speaker in completedSpeakers"
        :key="speaker.id"
        class="wm2-chip wm2-rec-speaker-chip"
        :class="[speakerIdTone(speaker.id), {'is-selected': speakerFilter === speaker.id}]"
        type="button"
        :title="`${t('transcription.speakerFilterHint')} · ${t('transcription.speakerSegmentStats', {
          count: speaker.segmentCount,
          duration: formatDuration(speaker.durationMs),
        })}`"
        :aria-pressed="speakerFilter === speaker.id"
        @click="toggleSpeakerFilter(speaker.id)"
      >
        <CheckIcon v-if="speakerFilter === speaker.id" class="wm-icon" />
        <span class="wm2-truncate">{{ speaker.name }}</span>
        <span class="wm2-rec-speaker-count wm2-tabular">{{ speaker.segmentCount }}</span>
      </button>
    </div>

    <Transition name="wm2-rec-swap" mode="out-in">
      <section
        v-if="completionView === 'transcript'"
        key="transcript"
        class="wm2-card wm2-rec-transcript"
        role="tabpanel"
      >
        <article
          v-for="segment in visibleCompletedSegments"
          :key="segment.id"
          v-memo="[
            segment.id,
            segment.text,
            segment.beginTimeMs,
            segment.speakerId,
            segment.speakerLabel,
            assigningSpeakerSegmentId,
            completedSpeakerKey,
          ]"
          class="wm2-rec-seg"
        >
          <header class="wm2-rec-seg-meta">
            <select
              v-if="segmentSpeakerLabel(segment) && completedSpeakers.length"
              class="wm2-rec-speaker-select"
              :class="speakerTone(segment)"
              :value="segment.speakerId"
              :aria-label="t('transcription.selectSpeaker')"
              :disabled="Boolean(assigningSpeakerSegmentId)"
              @change="assignCompletedSpeaker(segment, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="speaker in completedSpeakers" :key="speaker.id" :value="speaker.id">
                {{ speaker.name }}
              </option>
            </select>
            <span v-else-if="segmentSpeakerLabel(segment)" class="wm2-chip" :class="speakerTone(segment)">
              {{ segmentSpeakerLabel(segment) }}
            </span>
            <time class="wm2-tabular">{{ formatDuration(segment.beginTimeMs || 0) }}</time>
          </header>
          <p>{{ segment.text }}</p>
        </article>
      </section>

      <TranscriptionSummaryPanel
        v-else
        key="summary"
        :record="detail.record"
        :organizing="organizing"
        :has-generated-summary="hasGeneratedSummary"
        :has-completed-transcript="hasCompletedTranscript"
        @generate="organizeCompletedRecord"
      />
    </Transition>

    <TranscriptionResultActions
      :active-markdown-path="activeMarkdownPath"
      @open-history="emit('openHistory')"
    />
    <p class="wm2-rec-note">{{ t('transcription.savedToWiseMindDesc') }}</p>
  </div>

  <footer class="wm2-rec-footer wm-transcription-complete-footer">
    <button
      class="wm2-btn is-ghost is-sm wm2-rec-copy"
      :class="{'is-done': isFlashing('copy')}"
      type="button"
      :disabled="!completedTranscript"
      @click="copyCompletedTranscript"
    >
      <CheckIcon v-if="isFlashing('copy')" class="wm-icon" />
      <ClipboardDocumentIcon v-else class="wm-icon" />
      <span aria-live="polite">
        {{ isFlashing('copy') ? t('transcription.transcriptCopied') : t('transcription.copyTranscript') }}
      </span>
    </button>
    <span class="wm2-rec-spacer"></span>
    <button class="wm2-btn is-primary is-sm" type="button" @click="emit('newRecording')">
      <MicrophoneIcon class="wm-icon" />
      {{ t('transcription.newRecording') }}
    </button>
  </footer>

  <SpeakerManagerDialog v-model:open="speakerDialogOpen" :speakers="completedSpeakers" />
</template>
