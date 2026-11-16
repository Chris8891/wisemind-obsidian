<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {ArrowTopRightOnSquareIcon, DocumentTextIcon, XMarkIcon} from '@heroicons/vue/24/outline';

  import {usePlugin} from '../composables/usePlugin';
  import type {SourceMode} from '../services/assistantService';
  import {openObsidianNote} from '../services/noteNavigation';
  import type {ObsidianSourceItem} from '../types';

  import WmTooltip from './WmTooltip.vue';

  defineProps<{
    mode: SourceMode;
    currentPath: string;
    selectedNotes: ObsidianSourceItem[];
  }>();

  const emit = defineEmits<{
    remove: [path: string];
  }>();

  const plugin = usePlugin();
  const {t} = useI18n();

  const fileName = (path: string) => path.split('/').pop() || path;

  const openNote = (path: string) => {
    void openObsidianNote(plugin.app, path, {
      moved: t('obsidianMessages.noteMoved'),
      openFailed: t('obsidianMessages.noteOpenFailed'),
    });
  };
</script>

<template>
  <div v-if="mode === 'current' && currentPath" class="wm2-source-chips">
    <span class="wm2-chip wm2-source-chip">
      <DocumentTextIcon class="wm-icon" />
      <WmTooltip :content="currentPath">
        <span>{{ fileName(currentPath) }}</span>
      </WmTooltip>
      <WmTooltip :content="t('sourceNotes.openNote')">
        <button class="wm2-icon-btn" type="button" @click="openNote(currentPath)">
          <span class="wm-visually-hidden">{{ t('sourceNotes.openNote') }}</span>
          <ArrowTopRightOnSquareIcon class="wm-icon" />
        </button>
      </WmTooltip>
    </span>
  </div>

  <TransitionGroup
    v-else-if="mode === 'multi' && selectedNotes.length"
    tag="div"
    name="wm2-chip-pop"
    class="wm2-source-chips"
  >
    <span v-for="note in selectedNotes" :key="note.path" class="wm2-chip wm2-source-chip">
      <DocumentTextIcon class="wm-icon" />
      <WmTooltip :content="note.path">
        <span>{{ note.title || fileName(note.path) }}</span>
      </WmTooltip>
      <WmTooltip :content="t('sourceNotes.openNote')">
        <button class="wm2-icon-btn" type="button" @click="openNote(note.path)">
          <span class="wm-visually-hidden">{{ t('sourceNotes.openNote') }}</span>
          <ArrowTopRightOnSquareIcon class="wm-icon" />
        </button>
      </WmTooltip>
      <WmTooltip :content="t('sourceNotes.remove')">
        <button class="wm2-icon-btn is-danger" type="button" @click="emit('remove', note.path)">
          <span class="wm-visually-hidden">{{ t('sourceNotes.remove') }}</span>
          <XMarkIcon class="wm-icon" />
        </button>
      </WmTooltip>
    </span>
  </TransitionGroup>
</template>
