<script setup lang="ts">
  import {onMounted, onUnmounted, ref} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowUpIcon,
    AtSymbolIcon,
    CpuChipIcon,
    DocumentTextIcon,
    PlusIcon,
    StopIcon,
    TrashIcon,
    XMarkIcon,
  } from '@heroicons/vue/24/outline';

  import type {ObsidianSourceItem} from '../../../types';
  import NoteMentionPicker from '../../NoteMentionPicker.vue';
  import WmTooltip from '../../WmTooltip.vue';

  import ChatScopePicker from './ChatScopePicker.vue';
  import type {ChatComposerController} from './useChatComposer';
  import {useOpenNote} from './useChatContext';

  const props = defineProps<{
    composer: ChatComposerController;
    contextPaths: string[];
    contextNotes: ObsidianSourceItem[];
    loading: boolean;
    canSend: boolean;
    canClear: boolean;
    modelLabel: string;
    referenceTitle: (path: string) => string;
  }>();

  const selectedNotesOpen = defineModel<boolean>('selectedNotesOpen', {required: true});

  const emit = defineEmits<{
    clearContext: [];
    useCurrentNote: [];
    chooseNotes: [];
    removeContextPath: [path: string];
    clearMessages: [];
    send: [];
    stop: [];
  }>();

  const {t} = useI18n();
  const openNote = useOpenNote();
  // The controller object is created once by the page, so its refs can be bound directly.
  const {
    inputEl,
    mentionOpen,
    mentionActiveIndex,
    mentionCandidates,
    focusComposer,
    triggerMention,
    pickMentionCandidate,
    onInput,
    onKeydown,
    onPaste,
  } = props.composer;
  const composerEl = ref<HTMLElement | null>(null);
  const mentionWrapEl = ref<HTMLDivElement | null>(null);

  // Clicks on the composer padding focus the text box, like a regular input.
  const onComposerSurfaceClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, [contenteditable="true"], .wm2-chat-selected-menu')) return;
    focusComposer();
  };

  const onDocumentPointerDown = (event: PointerEvent) => {
    const target = event.target as Node | null;
    if (selectedNotesOpen.value && !(target && composerEl.value?.contains(target))) {
      selectedNotesOpen.value = false;
    }
    if (!mentionOpen.value) return;
    if (target && mentionWrapEl.value?.contains(target)) return;
    mentionOpen.value = false;
  };

  const onDocumentKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !selectedNotesOpen.value) return;
    event.preventDefault();
    event.stopPropagation();
    selectedNotesOpen.value = false;
  };

  onMounted(() => {
    document.addEventListener('pointerdown', onDocumentPointerDown, true);
    document.addEventListener('keydown', onDocumentKeydown, true);
  });

  onUnmounted(() => {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true);
    document.removeEventListener('keydown', onDocumentKeydown, true);
  });
</script>

<template>
  <footer ref="composerEl" class="wm2-card wm2-composer wm2-chat-composer" @click="onComposerSurfaceClick">
    <div class="wm2-composer-scope">
      <WmTooltip v-if="contextPaths.length > 1" :content="contextPaths.join('\n')">
        <button
          class="wm2-chip is-success wm2-chat-scope-chip"
          type="button"
          :aria-expanded="selectedNotesOpen"
          @click="selectedNotesOpen = !selectedNotesOpen"
        >
          <DocumentTextIcon class="wm-icon" />
          <span class="wm2-truncate">{{
            t('chat.selectedNotes', {count: contextPaths.length})
          }}</span>
        </button>
      </WmTooltip>
      <span v-else-if="contextPaths.length === 1" class="wm2-chip is-success wm2-chat-scope-chip">
        <WmTooltip :content="contextPaths[0]">
          <button
            class="wm2-plain-button wm2-chat-scope-open"
            type="button"
            @click="openNote(contextPaths[0])"
          >
            <span class="wm-visually-hidden">{{ t('chat.openNote') }}</span>
            <DocumentTextIcon class="wm-icon" />
            <span class="wm2-truncate">{{ referenceTitle(contextPaths[0]) }}</span>
          </button>
        </WmTooltip>
        <WmTooltip :content="t('chat.clearSelectedNotes')">
          <button class="wm2-plain-button wm2-chat-scope-remove" type="button" @click="emit('clearContext')">
            <span class="wm-visually-hidden">{{ t('chat.clearSelectedNotes') }}</span>
            <XMarkIcon class="wm-icon" />
          </button>
        </WmTooltip>
      </span>
      <WmTooltip v-else :content="t('chat.noSelectedNote')">
        <button class="wm2-chip" type="button" @click="emit('useCurrentNote')">
          <PlusIcon class="wm-icon" />
          {{ t('chat.useCurrentNote') }}
        </button>
      </WmTooltip>
      <button class="wm2-btn is-ghost is-xs" type="button" @click="emit('chooseNotes')">
        <DocumentTextIcon class="wm-icon" />
        {{ t('chat.chooseNote') }}
      </button>
    </div>

    <div v-if="selectedNotesOpen && contextPaths.length > 1" class="wm2-chat-selected-menu">
      <ul class="wm2-list">
        <li v-for="note in contextNotes" :key="note.path" class="wm2-list-row">
          <DocumentTextIcon class="wm-icon" />
          <button
            class="wm2-list-main wm2-plain-button"
            type="button"
            :title="note.path"
            @click="openNote(note.path)"
          >
            <span class="wm2-truncate">{{ note.title }}</span>
            <small class="wm2-muted wm2-truncate">{{ note.folderPath || t('chat.rootFolder') }}</small>
          </button>
          <WmTooltip :content="t('chat.removeNote')">
            <button
              class="wm2-icon-btn is-sm"
              type="button"
              @click="emit('removeContextPath', note.path)"
            >
              <span class="wm-visually-hidden">{{ t('chat.removeNote') }}</span>
              <XMarkIcon class="wm-icon" />
            </button>
          </WmTooltip>
        </li>
      </ul>
    </div>

    <div ref="mentionWrapEl" class="wm2-chat-input-wrap">
      <div
        ref="inputEl"
        class="wm2-chat-input"
        :data-placeholder="t('chat.inputPlaceholder')"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        :aria-label="t('chat.inputPlaceholder')"
        @input="onInput"
        @keydown="onKeydown"
        @paste="onPaste"
      ></div>
      <NoteMentionPicker
        v-if="mentionOpen"
        :candidates="mentionCandidates"
        :active-index="mentionActiveIndex"
        @pick="pickMentionCandidate"
      />
    </div>

    <div class="wm2-composer-footer">
      <div class="wm2-chat-tools">
        <WmTooltip :content="t('mention.ariaLabel')">
          <button class="wm2-icon-btn is-sm" type="button" @click="triggerMention">
            <span class="wm-visually-hidden">{{ t('mention.ariaLabel') }}</span>
            <AtSymbolIcon class="wm-icon" />
          </button>
        </WmTooltip>
        <WmTooltip :content="t('chat.clear')">
          <button
            class="wm2-icon-btn is-sm"
            type="button"
            :disabled="!canClear"
            @click="emit('clearMessages')"
          >
            <span class="wm-visually-hidden">{{ t('chat.clear') }}</span>
            <TrashIcon class="wm-icon" />
          </button>
        </WmTooltip>
        <ChatScopePicker />
        <WmTooltip :content="`${t('chat.currentModel')}: ${modelLabel}`">
          <span class="wm2-chip wm2-chat-model">
            <CpuChipIcon class="wm-icon" />
            <span class="wm2-truncate">{{ modelLabel }}</span>
          </span>
        </WmTooltip>
      </div>
      <WmTooltip v-if="loading" :content="t('chat.stop')">
        <button class="wm2-send wm2-chat-stop" type="button" @click="emit('stop')">
          <span class="wm-visually-hidden">{{ t('chat.stop') }}</span>
          <StopIcon class="wm-icon" />
        </button>
      </WmTooltip>
      <WmTooltip v-else :content="t('chat.send')">
        <button
          class="wm2-send wm2-chat-send"
          type="button"
          :disabled="!canSend"
          @click="emit('send')"
        >
          <span class="wm-visually-hidden">{{ t('chat.send') }}</span>
          <ArrowUpIcon class="wm-icon" />
        </button>
      </WmTooltip>
    </div>
  </footer>
</template>
