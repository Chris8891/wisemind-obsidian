import {computed, onMounted, onUnmounted, ref} from 'vue';
import {useI18n} from 'vue-i18n';

import {
  buildTaskHistory,
  type TaskHistoryLabels,
  WISEMIND_TASK_HISTORY_UPDATED_EVENT,
} from '../services/taskHistory';

import {usePlugin} from './usePlugin';

export const useTaskHistory = () => {
  const plugin = usePlugin();
  const {t, locale} = useI18n();
  const revision = ref(0);

  const labels = computed<TaskHistoryLabels>(() => ({
    all: t('taskHistoryService.all'),
    summary: t('taskHistoryService.summary'),
    cards: t('taskHistoryService.cards'),
    chat: t('taskHistoryService.chat'),
    sync: t('taskHistoryService.sync'),
    summaryTask: t('taskHistoryService.summaryTask'),
    cardsTask: t('taskHistoryService.cardsTask'),
    chatTask: t('taskHistoryService.chatTask'),
    syncTask: t('taskHistoryService.syncTask'),
    summaryTitle: t('taskHistoryService.summaryTitle'),
    cardsTitle: t('taskHistoryService.cardsTitle'),
    cardCount: count => t('taskHistoryService.cardCount', {count}),
    chatTitle: t('taskHistoryService.chatTitle'),
    messageCount: count => t('taskHistoryService.messageCount', {count}),
    syncDescription: item => t('taskHistoryService.syncDescription', item),
  }));

  const tasks = computed(() => (
    revision.value,
    locale.value,
    buildTaskHistory(plugin.settings, labels.value)
  ));

  const refresh = () => {
    revision.value += 1;
  };

  onMounted(() => window.addEventListener(WISEMIND_TASK_HISTORY_UPDATED_EVENT, refresh));
  onUnmounted(() => window.removeEventListener(WISEMIND_TASK_HISTORY_UPDATED_EVENT, refresh));

  return {tasks, refresh};
};
