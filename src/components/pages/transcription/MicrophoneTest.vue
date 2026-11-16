<script setup lang="ts">
  import {computed} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    MicrophoneIcon,
    PlayIcon,
    StopIcon,
  } from '@heroicons/vue/24/outline';

  import {usePlugin} from '../../../composables/usePlugin';
  import RekaSelect from '../../RekaSelect.vue';

  import {litBarCount, MIC_LEVEL_BAR_COUNT, MIC_TEST_BAR_COUNT} from './format';
  import {injectTranscriptionSetup} from './useTranscriptionSetup';

  const controller = usePlugin().transcription;
  const {t} = useI18n();
  const {form, loading, loadSetup, microphoneOptions, microphoneTest} = injectTranscriptionSetup();
  const {
    status: microphoneTestStatus,
    level: microphoneTestLevel,
    seconds: microphoneTestSeconds,
    url: microphoneTestUrl,
    error: microphoneTestError,
    start: startMicrophoneTest,
    stop: stopMicrophoneTest,
  } = microphoneTest;

  const isActive = computed(() => controller.isActive);
  const micTestLitCount = computed(() =>
    microphoneTestStatus.value === 'recording'
      ? litBarCount(microphoneTestLevel.value, MIC_TEST_BAR_COUNT)
      : 0,
  );
  const micLevelLitCount = computed(() =>
    microphoneTestStatus.value === 'recording'
      ? litBarCount(microphoneTestLevel.value, MIC_LEVEL_BAR_COUNT)
      : 0,
  );
</script>

<template>
  <li>
    <MicrophoneIcon class="wm-icon wm2-rec-row-icon" />
    <div class="wm2-rec-row-select is-grow">
      <RekaSelect
        v-model="form.deviceId"
        :options="microphoneOptions"
        :placeholder="t('transcription.chooseMicrophone')"
      />
    </div>
    <span
      class="wm2-rec-meter"
      :class="{'is-live': microphoneTestStatus === 'recording'}"
      aria-hidden="true"
    >
      <span
        v-for="index in MIC_TEST_BAR_COUNT"
        :key="index"
        :class="{'is-lit': index <= micTestLitCount}"
      ></span>
    </span>
    <button
      class="wm2-icon-btn is-sm"
      type="button"
      :title="t('common.refresh')"
      :aria-label="t('common.refresh')"
      :disabled="loading"
      @click="loadSetup(true)"
    >
      <ArrowPathIcon class="wm-icon" :class="{'wm2-spin': loading}" />
    </button>
    <button
      v-if="microphoneTestStatus !== 'recording'"
      class="wm2-btn is-ghost is-xs"
      type="button"
      :title="t('transcription.testRecordingDesc')"
      :disabled="isActive || loading"
      @click="startMicrophoneTest"
    >
      <PlayIcon class="wm-icon" />
      {{ microphoneTestUrl ? t('transcription.testAgain') : t('transcription.testRecording') }}
    </button>
    <button
      v-else
      class="wm2-btn is-ghost is-xs wm2-rec-test-stop"
      type="button"
      @click="stopMicrophoneTest(false)"
    >
      <StopIcon class="wm-icon" />
      {{ t('common.stop') }}
    </button>
  </li>
  <li
    v-if="microphoneTestStatus === 'recording' || microphoneTestError || microphoneTestUrl"
    class="wm2-rec-test-row"
    :class="{'is-error': Boolean(microphoneTestError)}"
    aria-live="polite"
  >
    <template v-if="microphoneTestStatus === 'recording'">
      <div class="wm2-rec-test-head">
        <span class="wm2-rec-dot" aria-hidden="true"></span>
        <span class="wm2-muted wm2-tabular">
          {{
            t('transcription.testingRecording', {
              seconds: Math.min(5, microphoneTestSeconds + 1),
            })
          }}
        </span>
      </div>
      <span class="wm2-rec-level" aria-hidden="true">
        <span
          v-for="index in MIC_LEVEL_BAR_COUNT"
          :key="index"
          :class="{'is-lit': index <= micLevelLitCount}"
        ></span>
      </span>
      <span class="wm2-rec-test-progress" aria-hidden="true"><span></span></span>
    </template>
    <div v-if="microphoneTestError" class="wm2-rec-test-head">
      <ExclamationTriangleIcon class="wm-icon wm2-rec-error-icon" />
      <p class="wm2-rec-error-text">{{ microphoneTestError }}</p>
      <button
        class="wm2-btn is-ghost is-xs"
        type="button"
        :disabled="isActive || loading"
        @click="startMicrophoneTest"
      >
        <ArrowPathIcon class="wm-icon" />
        {{ t('common.retry') }}
      </button>
    </div>
    <template v-if="microphoneTestUrl">
      <p class="wm2-rec-test-hint">
        <CheckCircleIcon class="wm-icon" />
        {{ t('transcription.testPlaybackHint') }}
      </p>
      <audio class="wm2-rec-test-audio" :src="microphoneTestUrl" controls></audio>
    </template>
  </li>
</template>
