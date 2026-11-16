<script setup lang="ts">
  import {useI18n} from 'vue-i18n';
  import {ChatBubbleOvalLeftEllipsisIcon, ClockIcon, TrashIcon} from '@heroicons/vue/24/outline';

  import type {AssistantChatSession} from '../../../types';
  import WmDialog from '../../WmDialog.vue';
  import WmTooltip from '../../WmTooltip.vue';

  defineProps<{
    sessions: AssistantChatSession[];
  }>();

  const open = defineModel<boolean>('open', {required: true});

  const emit = defineEmits<{
    select: [sessionId: string];
    delete: [session: AssistantChatSession];
  }>();

  const {t, locale} = useI18n();

  const formatHistoryTime = (time: number) =>
    new Date(time).toLocaleString(locale.value === 'en_US' ? 'en-US' : 'zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
</script>

<template>
  <WmDialog
    v-model:open="open"
    :title="t('chat.historyTitle', {count: sessions.length})"
    content-class="wm2-chat-history-dialog"
  >
    <ul v-if="sessions.length" class="wm2-list wm2-chat-history-list">
      <li v-for="session in sessions" :key="session.id" class="wm2-list-row">
        <ChatBubbleOvalLeftEllipsisIcon class="wm-icon" />
        <button
          class="wm2-list-main wm2-plain-button"
          type="button"
          :title="session.title"
          @click="emit('select', session.id)"
        >
          <span class="wm2-truncate">{{ session.title || t('chat.defaultTitle') }}</span>
          <small class="wm2-muted wm2-tabular">{{
            formatHistoryTime(session.updatedAt || session.createdAt)
          }}</small>
        </button>
        <WmTooltip :content="t('taskHistory.delete')">
          <button class="wm2-icon-btn is-sm" type="button" @click="emit('delete', session)">
            <span class="wm-visually-hidden">{{ t('taskHistory.delete') }}</span>
            <TrashIcon class="wm-icon" />
          </button>
        </WmTooltip>
      </li>
    </ul>
    <div v-else class="wm2-empty is-compact">
      <ClockIcon class="wm2-empty-icon" />
      <p>{{ t('chat.emptyHistory') }}</p>
    </div>
  </WmDialog>
</template>
