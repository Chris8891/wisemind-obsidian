<script setup lang="ts">
  import {computed, useId} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    AcademicCapIcon,
    ArrowDownTrayIcon,
    ChatBubbleLeftRightIcon,
    DocumentArrowDownIcon,
    EllipsisHorizontalCircleIcon,
    ExclamationTriangleIcon,
    LightBulbIcon,
    MicrophoneIcon,
    PencilSquareIcon,
    SparklesIcon,
    UserGroupIcon,
  } from '@heroicons/vue/24/outline';

  import type {TranscriptionScene} from '../../../types';
  import RekaSelect from '../../RekaSelect.vue';
  import RekaSwitch from '../../RekaSwitch.vue';

  import MicrophoneTest from './MicrophoneTest.vue';
  import TranscriptionRecordLinks from './TranscriptionRecordLinks.vue';
  import {injectTranscriptionSetup} from './useTranscriptionSetup';

  defineProps<{openingRecords: boolean}>();
  const emit = defineEmits<{openHistory: []; openAllRecords: []}>();
  const {t} = useI18n();
  const {
    activeMarkdownPath,
    form,
    startOptions,
    starting,
    quotaText,
    canStart,
    startBlockedReason,
    providerOptions,
    currentProvider,
    speakerCountOptions,
    handleLiveWriteToggle,
    start,
  } = injectTranscriptionSetup();

  const controlId = useId();
  const saveAudioSwitchId = `${controlId}-save-audio`;
  const speakerSwitchId = `${controlId}-speakers`;
  const liveWriteSwitchId = `${controlId}-live-write`;

  const sceneOptions = computed(() =>
    [
      {value: 'meeting', icon: UserGroupIcon},
      {value: 'class', icon: AcademicCapIcon},
      {value: 'interview', icon: ChatBubbleLeftRightIcon},
      {value: 'idea', icon: LightBulbIcon},
      {value: 'other', icon: EllipsisHorizontalCircleIcon},
    ].map(option => ({
      ...option,
      label: t(`transcription.scenes.${option.value}`),
    })),
  );
  const sceneValues = computed(() => sceneOptions.value.map(option => option.value));
  const handleSceneKeydown = (event: KeyboardEvent) => {
    const step = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[event.key];
    if (!step) return;
    event.preventDefault();
    const values = sceneValues.value;
    const index = Math.max(0, values.indexOf(form.value.scene));
    const nextIndex = (index + step + values.length) % values.length;
    form.value.scene = values[nextIndex] as TranscriptionScene;
    const group = (event.currentTarget as HTMLElement | null)?.parentElement;
    (group?.children[nextIndex] as HTMLElement | undefined)?.focus();
  };
</script>

<template>
  <div class="wm2-rec-body">
    <section class="wm2-section">
      <h4 class="wm2-section-title">{{ t('transcription.scene') }}</h4>
      <div class="wm2-tabs wm2-rec-scenes" role="radiogroup" :aria-label="t('transcription.scene')">
        <button
          v-for="option in sceneOptions"
          :key="option.value"
          class="wm2-tab"
          :class="{'is-active': form.scene === option.value}"
          type="button"
          role="radio"
          :title="option.label"
          :aria-checked="form.scene === option.value"
          :tabindex="form.scene === option.value ? 0 : -1"
          @click="form.scene = option.value as TranscriptionScene"
          @keydown="handleSceneKeydown"
        >
          <component :is="option.icon" class="wm-icon" />
          <span class="wm2-tab-label">{{ option.label }}</span>
        </button>
      </div>
    </section>

    <ul class="wm2-card wm2-list-card wm2-rec-settings">
      <li>
        <PencilSquareIcon class="wm-icon wm2-rec-row-icon" />
        <input
          v-model="form.title"
          class="wm2-rec-title-input"
          type="text"
          :aria-label="t('transcription.recordTitle')"
          :placeholder="t('transcription.recordTitlePlaceholder')"
        />
      </li>
      <MicrophoneTest />
      <li>
        <SparklesIcon class="wm-icon wm2-rec-row-icon" />
        <span class="wm2-list-main">
          <span>{{ t('transcription.provider') }}</span>
          <small v-if="startOptions && providerOptions.length === 0" class="wm2-text-warning">
            {{ t('transcription.providerSetupHint') }}
          </small>
        </span>
        <div class="wm2-rec-row-select">
          <RekaSelect
            v-model="form.providerId"
            :options="providerOptions"
            :placeholder="t('transcription.chooseProvider')"
          />
        </div>
      </li>
      <li
        v-if="currentProvider?.supportsSpeakerDiarization"
        class="wm2-rec-toggle-row"
        :class="{'is-disabled': !startOptions?.membership.canUseSpeakerDiarization}"
      >
        <UserGroupIcon class="wm-icon wm2-rec-row-icon" />
        <label class="wm2-list-main wm2-rec-toggle-label" :for="speakerSwitchId">
          <span>{{ t('transcription.speakerDiarization') }}</span>
          <small
            v-if="!startOptions?.membership.canUseSpeakerDiarization"
            class="wm2-rec-row-desc is-warning"
          >
            {{ t('transcription.speakerDiarizationUnavailable') }}
          </small>
          <small v-else class="wm2-rec-row-desc" :title="t('transcription.speakerDiarizationDesc')">
            {{ t('transcription.speakerDiarizationDesc') }}
          </small>
        </label>
        <RekaSwitch
          :id="speakerSwitchId"
          v-model="form.speakerDiarization"
          :disabled="!startOptions?.membership.canUseSpeakerDiarization"
          :aria-label="t('transcription.speakerDiarization')"
        />
      </li>
      <li v-if="currentProvider?.supportsSpeakerDiarization && form.speakerDiarization">
        <span class="wm2-rec-row-icon" aria-hidden="true"></span>
        <span class="wm2-list-main">{{ t('transcription.speakerCount') }}</span>
        <div class="wm2-rec-row-select">
          <RekaSelect v-model="form.speakerCount" :options="speakerCountOptions" />
        </div>
      </li>
      <li class="wm2-rec-toggle-row">
        <ArrowDownTrayIcon class="wm-icon wm2-rec-row-icon" />
        <label class="wm2-list-main wm2-rec-toggle-label" :for="saveAudioSwitchId">
          <span>{{ t('transcription.saveAudio') }}</span>
          <small class="wm2-rec-row-desc" :title="t('transcription.saveAudioDesc')">
            {{ t('transcription.saveAudioDesc') }}
          </small>
        </label>
        <RekaSwitch
          :id="saveAudioSwitchId"
          v-model="form.saveAudio"
          :aria-label="t('transcription.saveAudio')"
        />
      </li>
    </ul>

    <div class="wm2-rec-live" :class="{'is-on': form.liveWriteToNote}">
      <div class="wm2-rec-live-head">
        <RekaSwitch
          :id="liveWriteSwitchId"
          :model-value="form.liveWriteToNote"
          :aria-label="t('transcription.liveWriteToNote')"
          @update:model-value="handleLiveWriteToggle"
        />
        <label class="wm2-rec-toggle-label" :for="liveWriteSwitchId">
          {{ t('transcription.liveWriteToNote') }}
        </label>
      </div>
      <p
        v-if="form.liveWriteToNote && activeMarkdownPath"
        class="wm2-rec-live-desc wm2-truncate"
        :title="activeMarkdownPath"
      >
        <DocumentArrowDownIcon class="wm-icon" />
        <span class="wm2-truncate">{{ t('transcription.liveWriteTarget', {path: activeMarkdownPath}) }}</span>
      </p>
      <p v-else class="wm2-rec-live-desc">
        {{
          activeMarkdownPath
            ? t('transcription.liveWriteToNoteDesc')
            : t('transcription.liveWriteNeedsNote')
        }}
      </p>
    </div>

    <p v-if="startBlockedReason" class="wm2-rec-blocked" role="status">
      <ExclamationTriangleIcon class="wm-icon" />
      <span>{{ startBlockedReason }}</span>
    </p>
    <p v-if="quotaText" class="wm2-rec-note">{{ quotaText }}</p>
  </div>

  <footer class="wm2-rec-footer">
    <TranscriptionRecordLinks
      :opening-records="openingRecords"
      @open-history="emit('openHistory')"
      @open-all-records="emit('openAllRecords')"
    />
    <span class="wm2-rec-spacer"></span>
    <button
      class="wm2-btn is-primary is-sm wm-transcription-start-button"
      type="button"
      :title="startBlockedReason || t('transcription.start')"
      :aria-busy="starting"
      :disabled="!canStart"
      @click="start"
    >
      <span v-if="starting" class="wm2-spinner"></span>
      <MicrophoneIcon v-else class="wm-icon" />
      {{ starting ? t('transcription.starting') : t('transcription.start') }}
    </button>
  </footer>
</template>
