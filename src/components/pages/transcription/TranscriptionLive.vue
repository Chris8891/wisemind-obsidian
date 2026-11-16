<script setup lang="ts">
  import {computed, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowDownIcon,
    ArrowPathIcon,
    ArrowTopRightOnSquareIcon,
    CheckCircleIcon,
    CheckIcon,
    ExclamationTriangleIcon,
    FlagIcon,
    MicrophoneIcon,
    PauseIcon,
    PencilIcon,
    PlayIcon,
    StopIcon,
  } from '@heroicons/vue/24/outline';

  import {useFlashState} from '../../../composables/useFlashState';
  import {usePlugin} from '../../../composables/usePlugin';
  import {useStickToBottom} from '../../../composables/useStickToBottom';
  import type {TranscriptionMarkKind} from '../../../types';

  import {formatDuration, litBarCount, WAVE_BAR_COUNT} from './format';
  import {useSpeakerLabels} from './useSpeakers';
  import {useTranscriptionActions} from './useTranscriptionActions';

  const controller = usePlugin().transcription;
  const state = controller.state;
  const {t} = useI18n();
  const {runAction, openNotePath} = useTranscriptionActions();
  const {segmentSpeakerLabel, speakerTone} = useSpeakerLabels();
  const {flash, isFlashing} = useFlashState();

  const transcriptionStream = ref<HTMLElement | null>(null);
  const {following, reset: followLatest, jumpToLatest} = useStickToBottom(transcriptionStream);
  const markingKind = ref<TranscriptionMarkKind | ''>('');
  const highlightedSegmentIds = ref(new Set<string>());

  const isRecording = computed(() => state.status === 'recording');
  const isPaused = computed(() => state.status === 'paused');
  const waveLitCount = computed(() => (isPaused.value ? 0 : litBarCount(state.audioLevel, WAVE_BAR_COUNT)));
  const liveDotClass = computed(() => {
    if (isPaused.value) return 'is-paused';
    if (state.status === 'starting' || state.status === 'stopping') return 'is-idle';
    return '';
  });
  const isConnectionBusy = computed(
    () => state.connectionStatus === 'connecting' || state.connectionStatus === 'reconnecting',
  );
  const hasStreamContent = computed(() => Boolean(state.segments.length || state.partialText));
  const showJumpToLatest = computed(() => hasStreamContent.value && !following.value);
  const connectionTone = computed(() => {
    const status = state.connectionStatus || 'idle';
    if (status === 'connected') return 'is-success';
    if (status === 'connecting' || status === 'reconnecting') return 'is-due';
    if (status === 'failed' || status === 'disconnected') return 'is-error';
    return '';
  });
  const elapsed = computed(() => formatDuration(state.elapsedMs));
  const connectionLabel = computed(() =>
    t(`transcription.connection.${state.connectionStatus || 'idle'}`),
  );
  const statusLabel = computed(() => t(`transcription.status.${state.status}`));

  const mark = async (kind: TranscriptionMarkKind) => {
    if (markingKind.value) return;
    markingKind.value = kind;
    try {
      const marked = await runAction(() => controller.mark(kind));
      if (!marked) return;
      const latestSegment = state.segments[state.segments.length - 1];
      if (kind === 'highlight' && latestSegment) {
        highlightedSegmentIds.value = new Set(highlightedSegmentIds.value).add(latestSegment.id);
      }
      flash(`mark-${kind}`);
    } finally {
      markingKind.value = '';
    }
  };

  const openLiveTargetNote = () => openNotePath(state.liveNoteTargetPath);

  watch(
    () => state.status,
    status => {
      if (status !== 'starting' && status !== 'recording') return;
      followLatest();
      if (status === 'starting') highlightedSegmentIds.value = new Set();
    },
    {flush: 'post'},
  );
</script>

<template>
  <header class="wm2-rec-livebar" :class="{'is-paused': isPaused, 'is-stopping': state.status === 'stopping'}">
    <span class="wm2-rec-dot" :class="liveDotClass" aria-hidden="true"></span>
    <strong class="wm2-rec-timer wm2-tabular" role="timer" :aria-label="`${statusLabel} ${elapsed}`">
      {{ elapsed }}
    </strong>
    <span class="wm2-rec-wave" aria-hidden="true">
      <span
        v-for="index in WAVE_BAR_COUNT"
        :key="index"
        :class="{'is-lit': index <= waveLitCount}"
      ></span>
    </span>
    <span
      v-if="!isRecording"
      class="wm2-chip"
      :class="isPaused ? 'is-due' : ''"
      role="status"
      :title="statusLabel"
    >
      <span v-if="state.status === 'starting' || state.status === 'stopping'" class="wm2-spinner"></span>
      <PauseIcon v-else-if="isPaused" class="wm-icon" />
      <span class="wm2-truncate">{{ statusLabel }}</span>
    </span>
    <span
      v-if="state.connectionStatus === 'connected'"
      class="wm2-rec-conn"
      role="status"
      :title="connectionLabel"
      :aria-label="connectionLabel"
    ></span>
    <span
      v-else
      class="wm2-chip wm2-rec-conn-chip"
      :class="connectionTone"
      role="status"
      :title="connectionLabel"
    >
      <ArrowPathIcon v-if="isConnectionBusy" class="wm-icon wm2-spin" />
      <span class="wm2-truncate">{{ connectionLabel }}</span>
    </span>
  </header>

  <div class="wm2-rec-stream-wrap">
    <div ref="transcriptionStream" class="wm2-rec-body wm2-rec-stream" aria-live="polite">
      <article
        v-for="segment in state.segments"
        :key="segment.id"
        v-memo="[
          segment.id,
          segment.text,
          segment.beginTimeMs,
          segment.speakerId,
          segment.speakerLabel,
          highlightedSegmentIds.has(segment.id),
        ]"
        class="wm2-rec-seg"
      >
        <header class="wm2-rec-seg-meta">
          <span v-if="segmentSpeakerLabel(segment)" class="wm2-chip" :class="speakerTone(segment)">
            {{ segmentSpeakerLabel(segment) }}
          </span>
          <time class="wm2-tabular">{{ formatDuration(segment.beginTimeMs || 0) }}</time>
        </header>
        <p :class="{'is-highlight': highlightedSegmentIds.has(segment.id)}">
          {{ segment.text }}
          <span v-if="highlightedSegmentIds.has(segment.id)" class="wm2-rec-mark">
            {{ t('transcription.noteSections.keyPoints') }}
          </span>
        </p>
      </article>
      <article v-if="state.partialText" class="wm2-rec-seg is-partial">
        <header class="wm2-rec-seg-meta">
          <time class="wm2-tabular">{{ elapsed }}</time>
        </header>
        <p>{{ state.partialText }}<span class="wm2-rec-caret" aria-hidden="true"></span></p>
      </article>
      <div v-if="!state.segments.length && !state.partialText" class="wm2-empty is-compact">
        <MicrophoneIcon class="wm2-empty-icon" />
        <p>{{ t('transcription.waitingSpeech') }}</p>
      </div>

      <div
        v-if="state.liveNoteWriteStatus !== 'idle'"
        class="wm2-rec-writing"
        :class="{'is-error': state.liveNoteWriteStatus === 'error'}"
      >
        <ExclamationTriangleIcon v-if="state.liveNoteWriteStatus === 'error'" class="wm-icon" />
        <PencilIcon v-else class="wm-icon" />
        <span
          class="wm2-truncate"
          :title="state.liveNoteWriteStatus === 'error' ? undefined : state.liveNoteTargetPath"
        >
          {{
            state.liveNoteWriteStatus === 'error'
              ? t('transcription.liveWriteFailedInline')
              : t('transcription.liveWritingTo', {path: state.liveNoteTargetPath})
          }}
        </span>
        <button
          v-if="state.liveNoteTargetPath"
          class="wm2-link-button"
          type="button"
          @click="openLiveTargetNote"
        >
          <ArrowTopRightOnSquareIcon class="wm-icon" />
          {{ t('transcription.openTargetNote') }}
        </button>
      </div>
    </div>
    <Transition name="wm2-rec-pop">
      <button
        v-if="showJumpToLatest"
        class="wm2-rec-jump"
        :class="{'is-raised': state.liveNoteWriteStatus !== 'idle'}"
        type="button"
        @click="jumpToLatest"
      >
        <ArrowDownIcon class="wm-icon" />
        {{ t('transcription.jumpToLatest') }}
      </button>
    </Transition>
  </div>

  <div class="wm2-rec-status-line">
    <p v-if="state.error" class="wm2-rec-error-text wm2-rec-error-line" role="alert">
      <ExclamationTriangleIcon class="wm-icon" />
      <span>{{ state.error }}</span>
    </p>
    <p v-else-if="state.status === 'stopping'" class="wm2-rec-note" role="status">
      <span class="wm2-spinner"></span>
      {{ t('transcription.savingToWiseMind') }}
    </p>
    <p v-else class="wm2-rec-note">
      <CheckCircleIcon class="wm-icon" />
      {{ t('transcription.savingToWiseMind') }}
    </p>
  </div>

  <footer class="wm2-rec-footer is-compact">
    <button
      class="wm2-btn is-sm wm2-rec-mark-btn"
      :class="{'is-done': isFlashing('mark-highlight')}"
      type="button"
      :title="t('transcription.markHighlight')"
      :disabled="(!isRecording && !isPaused) || Boolean(markingKind)"
      @click="mark('highlight')"
    >
      <span v-if="markingKind === 'highlight'" class="wm2-spinner"></span>
      <CheckIcon v-else-if="isFlashing('mark-highlight')" class="wm-icon" />
      <FlagIcon v-else class="wm-icon" />
      <span class="wm2-truncate" aria-live="polite">
        {{
          isFlashing('mark-highlight')
            ? t('transcription.markHighlightSuccess')
            : t('transcription.markHighlight')
        }}
      </span>
    </button>
    <button
      class="wm2-btn is-sm wm2-rec-mark-btn"
      :class="{'is-done': isFlashing('mark-todo')}"
      type="button"
      :title="t('transcription.markTodo')"
      :disabled="(!isRecording && !isPaused) || Boolean(markingKind)"
      @click="mark('todo')"
    >
      <span v-if="markingKind === 'todo'" class="wm2-spinner"></span>
      <CheckCircleIcon v-else-if="isFlashing('mark-todo')" class="wm-icon" />
      <CheckIcon v-else class="wm-icon" />
      <span class="wm2-truncate" aria-live="polite">
        {{ isFlashing('mark-todo') ? t('transcription.markTodoSuccess') : t('transcription.markTodo') }}
      </span>
    </button>
    <span class="wm2-rec-spacer"></span>
    <button
      v-if="state.status === 'stopping' && state.error"
      class="wm2-btn is-sm"
      type="button"
      :title="t('transcription.retryResult')"
      @click="runAction(() => controller.retryCompletion())"
    >
      <ArrowPathIcon class="wm-icon" />
      {{ t('common.retry') }}
    </button>
    <button
      v-if="isRecording"
      class="wm2-icon-btn wm2-rec-pause"
      type="button"
      :title="t('transcription.pause')"
      :aria-label="t('transcription.pause')"
      @click="runAction(() => controller.pause())"
    >
      <PauseIcon class="wm-icon" />
    </button>
    <button
      v-else-if="isPaused"
      class="wm2-icon-btn wm2-rec-pause is-resume"
      type="button"
      :title="t('transcription.resume')"
      :aria-label="t('transcription.resume')"
      @click="runAction(() => controller.resume())"
    >
      <PlayIcon class="wm-icon" />
    </button>
    <button
      class="wm2-rec-stop"
      type="button"
      :aria-busy="state.status === 'stopping'"
      :disabled="state.status === 'stopping'"
      @click="runAction(() => controller.stop())"
    >
      <span v-if="state.status === 'stopping'" class="wm2-spinner"></span>
      <StopIcon v-else class="wm-icon" />
      {{ state.status === 'stopping' ? t('transcription.stopping') : t('transcription.stop') }}
    </button>
  </footer>
</template>
