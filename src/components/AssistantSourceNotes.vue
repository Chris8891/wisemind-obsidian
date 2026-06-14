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

  const openNote = (path: string) => {
    void openObsidianNote(plugin.app, path, {
      moved: t('obsidianMessages.noteMoved'),
      openFailed: t('obsidianMessages.noteOpenFailed'),
    });
  };
</script>

<template>
  <div v-if="mode === 'current' && currentPath" class="wm-source-note-list">
    <span class="wm-source-note-chip">
      <DocumentTextIcon class="wm-icon" />
      <span>{{ currentPath }}</span>
      <WmTooltip :content="t('sourceNotes.openNote')">
        <button class="wm-icon-button" type="button" @click="openNote(currentPath)">
          <ArrowTopRightOnSquareIcon class="wm-icon" />
        </button>
      </WmTooltip>
    </span>
  </div>

  <div v-else-if="mode === 'multi' && selectedNotes.length" class="wm-source-note-list">
    <div v-for="note in selectedNotes" :key="note.path" class="wm-source-note-row">
      <span class="wm-source-note-chip">
        <DocumentTextIcon class="wm-icon" />
        <span>{{ note.path }}</span>
        <WmTooltip :content="t('sourceNotes.openNote')">
          <button class="wm-icon-button" type="button" @click="openNote(note.path)">
            <ArrowTopRightOnSquareIcon class="wm-icon" />
          </button>
        </WmTooltip>
        <WmTooltip :content="t('sourceNotes.remove')">
          <button class="wm-icon-button" type="button" @click="emit('remove', note.path)">
            <XMarkIcon class="wm-icon" />
          </button>
        </WmTooltip>
      </span>
    </div>
  </div>
</template>
