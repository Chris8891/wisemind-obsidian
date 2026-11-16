<script setup lang="ts">
  import {ref} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ChatBubbleOvalLeftEllipsisIcon,
    ClockIcon,
    PlusIcon,
    TrashIcon,
    XMarkIcon,
  } from '@heroicons/vue/24/outline';
  import {PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger} from 'reka-ui';

  import WmTooltip from '../../WmTooltip.vue';

  import type {ChatSession} from './types';

  defineProps<{
    sessions: ChatSession[];
    activeSessionId: string;
    activeTitle?: string;
    loading: boolean;
    savedCount: number;
    isSessionLoading: (sessionId: string) => boolean;
  }>();

  const emit = defineEmits<{
    switch: [sessionId: string];
    close: [sessionId: string];
    create: [];
    /** New session from the header button; the page focuses the composer afterwards. */
    createAndFocus: [];
    openHistory: [];
    closeAll: [];
    focusComposer: [];
  }>();

  const {t} = useI18n();
  const sessionMenuOpen = ref(false);

  // Reka returns focus to the popover trigger on close; session actions send it to the composer instead.
  let focusComposerOnMenuClose = false;
  const onSessionMenuCloseAutoFocus = (event: Event) => {
    if (!focusComposerOnMenuClose) return;
    focusComposerOnMenuClose = false;
    event.preventDefault();
    emit('focusComposer');
  };

  const switchSession = (id: string) => {
    emit('switch', id);
    focusComposerOnMenuClose = true;
    sessionMenuOpen.value = false;
  };

  const createSessionFromMenu = () => {
    focusComposerOnMenuClose = true;
    sessionMenuOpen.value = false;
    emit('create');
  };

  const openFullHistory = () => {
    sessionMenuOpen.value = false;
    emit('openHistory');
  };

  const closeAllSessions = () => {
    sessionMenuOpen.value = false;
    emit('closeAll');
  };
</script>

<template>
  <header class="wm2-chat-bar">
    <span v-if="loading" class="wm2-spinner"></span>
    <ChatBubbleOvalLeftEllipsisIcon v-else class="wm-icon wm2-chat-bar-icon" />
    <strong class="wm2-truncate wm2-chat-bar-title" :title="activeTitle">
      {{ activeTitle || t('chat.defaultTitle') }}
    </strong>
    <div class="wm2-chat-bar-actions">
      <PopoverRoot v-model:open="sessionMenuOpen">
        <!--
          Keep Tooltip and PopoverTrigger on different nodes.
          Nesting both as-child on the same button breaks the popover anchor;
          portaling into overflow:hidden root also clips the menu.
        -->
        <WmTooltip :content="sessionMenuOpen ? '' : t('chat.history')" side="bottom">
          <span class="wm2-chat-history-trigger">
            <PopoverTrigger as-child>
              <button
                class="wm2-icon-btn is-sm"
                :class="{'is-active': sessionMenuOpen}"
                type="button"
              >
                <span class="wm-visually-hidden">{{ t('chat.history') }}</span>
                <ClockIcon class="wm-icon" />
              </button>
            </PopoverTrigger>
          </span>
        </WmTooltip>
        <PopoverPortal>
          <PopoverContent
            class="wm2-chat-popover"
            side="bottom"
            align="end"
            :side-offset="6"
            :collision-padding="8"
            @close-auto-focus="onSessionMenuCloseAutoFocus"
          >
            <h4 class="wm2-section-title">{{ t('chat.sessionList') }}</h4>
            <ul class="wm2-chat-session-list">
              <li
                v-for="session in sessions"
                :key="session.id"
                class="wm2-chat-session-item"
                :class="{'is-active': session.id === activeSessionId}"
              >
                <button
                  class="wm2-btn is-ghost is-sm wm2-chat-session-main"
                  type="button"
                  :title="session.title"
                  :aria-current="session.id === activeSessionId ? 'true' : undefined"
                  @click="switchSession(session.id)"
                >
                  <span v-if="isSessionLoading(session.id)" class="wm2-spinner"></span>
                  <ChatBubbleOvalLeftEllipsisIcon v-else class="wm-icon" />
                  <span class="wm2-truncate">{{ session.title }}</span>
                </button>
                <WmTooltip :content="t('chat.close')">
                  <button class="wm2-icon-btn is-sm" type="button" @click="emit('close', session.id)">
                    <span class="wm-visually-hidden">{{ t('chat.close') }}</span>
                    <XMarkIcon class="wm-icon" />
                  </button>
                </WmTooltip>
              </li>
            </ul>
            <div class="wm2-chat-popover-footer">
              <button
                class="wm2-btn is-ghost is-sm wm2-chat-session-main"
                type="button"
                @click="createSessionFromMenu"
              >
                <PlusIcon class="wm-icon" />
                {{ t('chat.createSession') }}
              </button>
              <button
                class="wm2-btn is-ghost is-sm wm2-chat-session-main"
                type="button"
                @click="openFullHistory"
              >
                <ClockIcon class="wm-icon" />
                {{ t('chat.historyTitle', {count: savedCount}) }}
              </button>
              <button
                class="wm2-btn is-ghost is-sm wm2-chat-session-main is-danger"
                type="button"
                @click="closeAllSessions"
              >
                <TrashIcon class="wm-icon" />
                {{ t('chat.closeAll') }}
              </button>
            </div>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
      <WmTooltip :content="t('chat.createSession')" side="bottom">
        <button class="wm2-icon-btn is-sm" type="button" @click="emit('createAndFocus')">
          <span class="wm-visually-hidden">{{ t('chat.createSession') }}</span>
          <PlusIcon class="wm-icon" />
        </button>
      </WmTooltip>
    </div>
  </header>
</template>
