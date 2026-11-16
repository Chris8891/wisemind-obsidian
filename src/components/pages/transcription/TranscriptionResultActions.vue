<script setup lang="ts">
  import {computed, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowTopRightOnSquareIcon,
    CheckCircleIcon,
    ClockIcon,
    DocumentArrowDownIcon,
    DocumentPlusIcon,
  } from '@heroicons/vue/24/outline';

  import {usePlugin} from '../../../composables/usePlugin';

  import {useTranscriptionActions} from './useTranscriptionActions';

  const props = defineProps<{activeMarkdownPath: string}>();
  const emit = defineEmits<{openHistory: []}>();
  const controller = usePlugin().transcription;
  const state = controller.state;
  const {t} = useI18n();
  const {runAction, openNotePath, openCurrentRecord} = useTranscriptionActions();

  const insertingNote = ref(false);
  const insertedNotePaths = ref(new Set<string>());
  const creatingNote = ref(false);
  const createdNotePath = ref('');

  const currentRecordId = computed(() => state.completedDetail?.record.id || '');
  const isCurrentNoteAlreadyWritten = computed(
    () =>
      Boolean(props.activeMarkdownPath) &&
      ((state.liveNoteWriteStatus === 'completed' &&
        state.liveNoteTargetPath === props.activeMarkdownPath) ||
        insertedNotePaths.value.has(props.activeMarkdownPath)),
  );

  const insertIntoCurrentNote = async () => {
    const path = props.activeMarkdownPath;
    if (!path || insertingNote.value || isCurrentNoteAlreadyWritten.value) return;
    insertingNote.value = true;
    try {
      const written = await runAction(() => controller.insertIntoTargetNote(path));
      if (written) insertedNotePaths.value = new Set(insertedNotePaths.value).add(written);
    } finally {
      insertingNote.value = false;
    }
  };

  const createNewNote = async () => {
    if (creatingNote.value) return;
    if (createdNotePath.value) {
      await openNotePath(createdNotePath.value);
      return;
    }
    creatingNote.value = true;
    try {
      const created = await runAction(() => controller.saveAsNewNote());
      if (created) createdNotePath.value = created;
    } finally {
      creatingNote.value = false;
    }
  };

  watch(currentRecordId, () => {
    insertedNotePaths.value = new Set();
    createdNotePath.value = '';
  });
</script>

<template>
  <div class="wm2-rec-actions">
    <button
      class="wm2-action"
      :class="{'is-done': isCurrentNoteAlreadyWritten}"
      type="button"
      :title="
        !activeMarkdownPath
          ? t('transcription.liveWriteNeedsNote')
          : isCurrentNoteAlreadyWritten
            ? `${t('transcription.alreadyInsertedCurrentNote')} · ${activeMarkdownPath}`
            : `${t('transcription.insertCurrentNote')} · ${activeMarkdownPath}`
      "
      :aria-busy="insertingNote"
      :disabled="!activeMarkdownPath || isCurrentNoteAlreadyWritten || insertingNote"
      @click="insertIntoCurrentNote"
    >
      <span v-if="insertingNote" class="wm2-spinner"></span>
      <CheckCircleIcon v-else-if="isCurrentNoteAlreadyWritten" class="wm-icon" />
      <DocumentArrowDownIcon v-else class="wm-icon" />
      <span>
        {{
          t(
            isCurrentNoteAlreadyWritten
              ? 'transcription.alreadyInsertedCurrentNote'
              : 'transcription.insertCurrentNote',
          )
        }}
      </span>
    </button>
    <button
      class="wm2-action"
      :class="{'is-done': Boolean(createdNotePath)}"
      type="button"
      :title="
        createdNotePath
          ? t('transcription.savedNewNote', {path: createdNotePath})
          : t('transcription.saveNewNote')
      "
      :aria-busy="creatingNote"
      :disabled="creatingNote"
      @click="createNewNote"
    >
      <span v-if="creatingNote" class="wm2-spinner"></span>
      <CheckCircleIcon v-else-if="createdNotePath" class="wm-icon" />
      <DocumentPlusIcon v-else class="wm-icon" />
      <span>{{ createdNotePath ? t('transcription.openTargetNote') : t('transcription.saveNewNote') }}</span>
    </button>
    <button
      class="wm2-action"
      type="button"
      :title="t('transcription.openInWiseMind')"
      @click="openCurrentRecord"
    >
      <ArrowTopRightOnSquareIcon class="wm-icon" />
      <span>{{ t('transcription.openInWiseMind') }}</span>
    </button>
    <button class="wm2-action" type="button" :title="t('transcription.history')" @click="emit('openHistory')">
      <ClockIcon class="wm-icon" />
      <span>{{ t('transcription.history') }}</span>
    </button>
  </div>
</template>
