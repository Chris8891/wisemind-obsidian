<script setup lang="ts">
  import {computed, nextTick, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {ArrowDownIcon} from '@heroicons/vue/24/outline';

  import {useStickToBottom} from '../../../composables/useStickToBottom';
  import WmTooltip from '../../WmTooltip.vue';

  import ChatEmptyState from './ChatEmptyState.vue';
  import ChatMessage from './ChatMessage.vue';
  import type {ChatSession, MentionTextSegment} from './types';
  import {useOpenNote} from './useChatContext';
  import {useChatMessageActions} from './useChatMessageActions';

  const VISIBLE_MESSAGE_PAGE = 80;

  const props = defineProps<{
    session?: ChatSession;
    loading: boolean;
    streamingMessageId?: string;
    modelLabel: string;
    tokenize: (text: string) => MentionTextSegment[];
    referenceTitle: (path: string) => string;
  }>();

  const emit = defineEmits<{
    regenerate: [];
    sendPrompt: [prompt: string];
    /** A starter prompt from the empty state, to be placed in the composer. */
    emptyPrompt: [prompt: string];
  }>();

  const {t} = useI18n();
  const openNote = useOpenNote();
  const streamEl = ref<HTMLDivElement | null>(null);
  const visibleLimit = ref(VISIBLE_MESSAGE_PAGE);
  const {following, jumpToLatest} = useStickToBottom(streamEl);
  const {savingNoteId, isFlashing, copyMessage, insertMessage, saveMessageAsNote, makeCards} =
    useChatMessageActions({
      sessionTitle: () => props.session?.title,
      referenceTitle: path => props.referenceTitle(path),
    });

  watch(
    () => props.session?.id,
    () => {
      visibleLimit.value = VISIBLE_MESSAGE_PAGE;
    },
  );

  const allMessages = computed(() => props.session?.messages || []);
  const hiddenCount = computed(() => Math.max(0, allMessages.value.length - visibleLimit.value));
  const visibleMessages = computed(() =>
    hiddenCount.value > 0 ? allMessages.value.slice(-visibleLimit.value) : allMessages.value,
  );
  const lastAssistantMessageId = computed(() => {
    const messages = allMessages.value;
    const last = messages[messages.length - 1];
    return last?.role === 'assistant' ? last.id : '';
  });
  const showFollowUps = computed(() => Boolean(lastAssistantMessageId.value) && !props.loading);
  const showJumpToLatest = computed(
    () => !following.value && Boolean(allMessages.value.length),
  );
  const followUpPrompts = computed(() => [
    t('chat.followUpSimpler'),
    t('chat.followUpQuiz'),
    t('chat.followUpOutline'),
  ]);

  const showEarlierMessages = () => {
    visibleLimit.value += VISIBLE_MESSAGE_PAGE;
  };

  const applyScroll = () => {
    const el = streamEl.value;
    if (!el || !following.value) return;
    el.scrollTop = el.scrollHeight;
  };

  // Markdown renders after nextTick, so scroll once more on the next frame.
  const scrollToBottom = async (force = true) => {
    if (force) following.value = true;
    await nextTick();
    applyScroll();
    window.requestAnimationFrame(applyScroll);
  };

  defineExpose({scrollToBottom});
</script>

<template>
  <div class="wm2-chat-stream-wrap">
    <div ref="streamEl" class="wm2-chat-stream">
      <template v-if="session">
        <ChatEmptyState
          v-if="!session.messages.length && !loading"
          @prompt="emit('emptyPrompt', $event)"
        />

        <button
          v-if="hiddenCount > 0"
          class="wm2-btn is-ghost is-xs wm:mb-2"
          type="button"
          @click="showEarlierMessages"
        >
          {{ t('chat.showEarlierMessages', {count: hiddenCount}) }}
        </button>

        <ChatMessage
          v-for="message in visibleMessages"
          :key="message.id"
          :message="message"
          :streaming="streamingMessageId === message.id"
          :latest="message.id === lastAssistantMessageId"
          :loading="loading"
          :saving="savingNoteId === message.id"
          :model-label="modelLabel"
          :tokenize="tokenize"
          :reference-title="referenceTitle"
          :is-flashing="isFlashing"
          @copy="copyMessage"
          @insert="insertMessage"
          @save-note="saveMessageAsNote"
          @make-cards="makeCards"
          @regenerate="emit('regenerate')"
          @open-note="openNote"
        />

        <div v-if="loading && !streamingMessageId" class="wm2-chat-thinking">
          <span class="wm2-spinner"></span>
          <span>{{ t('chat.thinking') }}</span>
        </div>

        <div v-if="showFollowUps" class="wm2-row wm2-chips">
          <button
            v-for="prompt in followUpPrompts"
            :key="prompt"
            class="wm2-chip"
            type="button"
            @click="emit('sendPrompt', prompt)"
          >
            {{ prompt }}
          </button>
        </div>
      </template>
    </div>
    <WmTooltip v-if="showJumpToLatest" :content="t('chat.scrollToLatest')">
      <button class="wm2-chat-jump" type="button" @click="jumpToLatest">
        <span class="wm-visually-hidden">{{ t('chat.scrollToLatest') }}</span>
        <ArrowDownIcon class="wm-icon" />
      </button>
    </WmTooltip>
  </div>
</template>
