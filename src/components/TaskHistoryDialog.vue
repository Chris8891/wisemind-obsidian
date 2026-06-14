<script setup lang="ts">
  import {computed, onMounted, onUnmounted, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    BookmarkSquareIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    CheckCircleIcon,
    ChevronRightIcon,
    ClockIcon,
    DocumentTextIcon,
    TrashIcon,
  } from '@heroicons/vue/24/outline';
  import {Notice} from 'obsidian';

  import {usePlugin} from '../composables/usePlugin';
  import {
    buildTaskHistory,
    matchesTaskSearch,
    notifyTaskHistoryUpdated,
    type TaskHistoryEntry,
    type TaskHistoryLabels,
    type TaskHistoryType,
    WISEMIND_TASK_HISTORY_UPDATED_EVENT,
  } from '../services/taskHistory';

  import RekaSelect from './RekaSelect.vue';
  import WmTooltip from './WmTooltip.vue';

  const props = defineProps<{
    open: boolean;
    defaultType: TaskHistoryType;
  }>();

  const emit = defineEmits<{
    close: [];
    select: [task: TaskHistoryEntry];
    'update:defaultType': [value: TaskHistoryType];
  }>();

  const plugin = usePlugin();
  const {t, locale} = useI18n();
  const search = ref('');
  const selectedType = ref<TaskHistoryType>(props.defaultType);
  const revision = ref(0);
  const expandedIds = ref(new Set<string>());
  const overlayPointerDownOnBackdrop = ref(false);

  watch(
    () => [props.open, props.defaultType] as const,
    ([open, type]) => {
      if (open) {
        selectedType.value = type;
        search.value = '';
        expandedIds.value = new Set();
        revision.value += 1;
      }
    },
  );

  watch(selectedType, value => emit('update:defaultType', value));

  const taskKey = (task: TaskHistoryEntry) => `${task.type}:${task.id}`;

  const taskHistoryLabels = computed<TaskHistoryLabels>(() => ({
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

  const taskTypeOptions = computed(() => [
    {value: 'all', label: t('taskHistoryService.all')},
    {value: 'summary', label: t('taskHistoryService.summary')},
    {value: 'cards', label: t('taskHistoryService.cards')},
    {value: 'chat', label: t('taskHistoryService.chat')},
    {value: 'sync', label: t('taskHistoryService.sync')},
  ]);

  const tasks = computed(
    () => (
      revision.value, locale.value, buildTaskHistory(plugin.settings, taskHistoryLabels.value)
    ),
  );
  const filteredTasks = computed(() =>
    tasks.value.filter(
      task =>
        (selectedType.value === 'all' || task.type === selectedType.value) &&
        matchesTaskSearch(task, search.value),
    ),
  );
  const allVisibleExpanded = computed(
    () =>
      filteredTasks.value.length > 0 &&
      filteredTasks.value.every(task => expandedIds.value.has(taskKey(task))),
  );

  const formatTime = (time: number) =>
    new Date(time).toLocaleString(locale.value === 'en_US' ? 'en-US' : 'zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const taskIcon = (type: TaskHistoryEntry['type']) => {
    if (type === 'cards') return BookmarkSquareIcon;
    if (type === 'chat') return ChatBubbleOvalLeftEllipsisIcon;
    if (type === 'sync') return CheckCircleIcon;
    return DocumentTextIcon;
  };

  const taskMeta = (task: TaskHistoryEntry) => {
    if (task.type === 'cards') return `${formatTime(task.createdAt)} · ${task.description}`;
    if (task.type === 'chat') {
      return `${formatTime(task.createdAt)} · ${t('taskHistory.messageCount', {
        count: (task.raw as any).messages?.length || 0,
      })}`;
    }
    return formatTime(task.createdAt);
  };

  const taskSource = (task: TaskHistoryEntry) => {
    if (task.type === 'summary' || task.type === 'cards' || task.type === 'chat') {
      const raw = task.raw as any;
      return raw.contextPath || raw.sourcePath || raw.sourceTitle || task.description;
    }
    const raw = task.raw as any;
    return `${raw.sourceLabel || ''} -> ${raw.targetLabel || ''}`;
  };

  const taskCollapsedContent = (task: TaskHistoryEntry) => {
    if (task.type === 'cards')
      return t('taskHistory.cardCollapsed', {count: (task.raw as any).cards?.length || 0});
    if (task.type === 'chat') {
      const messages = (task.raw as any).messages || [];
      const last = messages[messages.length - 1];
      return last?.content || t('taskHistory.emptyChat');
    }
    if (task.type === 'sync') return task.description;
    return task.content.trim();
  };

  const syncTaskRows = (task: TaskHistoryEntry) => {
    const raw = task.raw as any;
    if (raw.syncItems?.length) return raw.syncItems;
    return (raw.itemTitles || []).map((title: string) => ({
      title,
      target: raw.targetLabel || t('taskHistory.target'),
      status: 'created',
    }));
  };

  const taskExpandedContent = (task: TaskHistoryEntry) => {
    if (task.type === 'cards') {
      return ((task.raw as any).cards || [])
        .map((card: any, index: number) => `${index + 1}. ${card.content}`)
        .join('\n\n');
    }
    if (task.type === 'chat') {
      return ((task.raw as any).messages || [])
        .map(
          (message: any) =>
            `${message.role === 'user' ? t('taskHistory.me') : 'WiseMindAI'}: ${message.content}`,
        )
        .join('\n\n');
    }
    if (task.type === 'sync') {
      const raw = task.raw as any;
      return [
        t('taskHistory.source', {value: raw.sourceLabel || ''}),
        t('taskHistory.targetLine', {value: raw.targetLabel || ''}),
        t('taskHistory.resultLine', {
          created: raw.created,
          updated: raw.updated,
          skipped: raw.skipped,
          failed: raw.failed,
        }),
        '',
        ...((raw.itemTitles || []) as string[]).map((title, index) => `${index + 1}. ${title}`),
      ].join('\n');
    }
    return ((task.raw as any).markdown || task.content).trim();
  };

  const toggleTask = (task: TaskHistoryEntry) => {
    const next = new Set(expandedIds.value);
    const key = taskKey(task);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedIds.value = next;
  };

  const toggleAll = () => {
    if (allVisibleExpanded.value) {
      const next = new Set(expandedIds.value);
      filteredTasks.value.forEach(task => next.delete(taskKey(task)));
      expandedIds.value = next;
      return;
    }
    expandedIds.value = new Set([...expandedIds.value, ...filteredTasks.value.map(taskKey)]);
  };

  const deleteTask = async (task: TaskHistoryEntry) => {
    if (!window.confirm(t('taskHistory.deleteConfirm', {title: task.title}))) return;
    if (task.type === 'summary') {
      plugin.settings.assistantSummaryHistory = plugin.settings.assistantSummaryHistory.filter(
        item => item.id !== task.id,
      );
    } else if (task.type === 'cards') {
      plugin.settings.assistantCardHistory = plugin.settings.assistantCardHistory.filter(
        item => item.id !== task.id,
      );
    } else if (task.type === 'chat') {
      plugin.settings.assistantChatSessions = plugin.settings.assistantChatSessions.filter(
        item => item.id !== task.id,
      );
    } else {
      plugin.settings.syncHistory = plugin.settings.syncHistory.filter(item => item.id !== task.id);
    }
    const next = new Set(expandedIds.value);
    next.delete(taskKey(task));
    expandedIds.value = next;
    revision.value += 1;
    await plugin.saveSettings();
    notifyTaskHistoryUpdated();
    new Notice(t('taskHistory.deleted'));
  };

  const refreshHistory = () => {
    revision.value += 1;
  };

  const onOverlayPointerDown = (event: PointerEvent) => {
    overlayPointerDownOnBackdrop.value = event.target === event.currentTarget;
  };

  const onOverlayClick = (event: MouseEvent) => {
    if (event.target === event.currentTarget && overlayPointerDownOnBackdrop.value) {
      emit('close');
    }
    overlayPointerDownOnBackdrop.value = false;
  };

  onMounted(() => {
    window.addEventListener(WISEMIND_TASK_HISTORY_UPDATED_EVENT, refreshHistory);
  });

  onUnmounted(() => {
    window.removeEventListener(WISEMIND_TASK_HISTORY_UPDATED_EVENT, refreshHistory);
  });
</script>

<template>
  <div
    v-if="open"
    class="wm-modal-overlay"
    @pointerdown="onOverlayPointerDown"
    @click="onOverlayClick"
  >
    <section
      class="wm-modal-box wm-history-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('taskHistory.ariaLabel')"
    >
      <header class="wm-history-dialog-header">
        <h3 class="wm-dialog-title">{{ t('taskHistory.title') }}</h3>
        <div class="wm-history-dialog-actions">
          <WmTooltip
            :content="
              allVisibleExpanded ? t('taskHistory.collapseAll') : t('taskHistory.expandAll')
            "
          >
            <button class="wm-icon-button" type="button" @click="toggleAll">
              <ChevronRightIcon class="wm-icon" :class="{'is-expanded': allVisibleExpanded}" />
            </button>
          </WmTooltip>
          <button
            class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
            type="button"
            @click="emit('close')"
            >✕</button
          >
        </div>
      </header>

      <div class="wm-history-toolbar">
        <RekaSelect v-model="selectedType" :options="taskTypeOptions" />
        <input
          v-model="search"
          class="wm-input"
          :placeholder="t('taskHistory.searchPlaceholder')"
        />
      </div>

      <div class="wm-history-list">
        <article v-for="task in filteredTasks" :key="taskKey(task)" class="wm-history-task">
          <div class="wm-history-task-body">
            <div class="wm-history-task-line">
              <component :is="taskIcon(task.type)" class="wm-history-line-icon" />
              <strong>{{ task.title }}</strong>
            </div>
            <div class="wm-history-task-line">
              <ClockIcon class="wm-history-line-icon" />
              <small>{{ taskMeta(task) }}</small>
            </div>
            <div class="wm-history-task-line">
              <DocumentTextIcon class="wm-history-line-icon" />
              <small>{{ taskSource(task) }}</small>
            </div>
            <div v-if="task.type === 'sync'" class="wm-sync-detail-list">
              <div
                v-for="(item, index) in syncTaskRows(task).slice(
                  0,
                  expandedIds.has(taskKey(task)) ? undefined : 3,
                )"
                :key="`${item.title}:${index}`"
                class="wm-sync-detail-row"
              >
                <strong>{{ item.title }}</strong>
                <ChevronRightIcon class="wm-icon" />
                <span>{{ item.target }}</span>
              </div>
            </div>
            <pre
              v-else
              class="wm-history-task-content"
              :class="{'is-expanded': expandedIds.has(taskKey(task))}"
              >{{
                expandedIds.has(taskKey(task))
                  ? taskExpandedContent(task)
                  : taskCollapsedContent(task)
              }}</pre
            >
            <button
              v-if="task.type !== 'sync'"
              class="wm-history-expand"
              type="button"
              @click="toggleTask(task)"
            >
              {{
                expandedIds.has(taskKey(task)) ? t('taskHistory.collapse') : t('taskHistory.expand')
              }}
              <ChevronRightIcon
                class="wm-icon"
                :class="{'is-expanded': expandedIds.has(taskKey(task))}"
              />
            </button>
          </div>
          <div class="wm-history-task-actions">
            <WmTooltip :content="t('taskHistory.open')">
              <button class="wm-icon-button" type="button" @click="emit('select', task)">
                <CheckCircleIcon class="wm-icon" />
              </button>
            </WmTooltip>
            <WmTooltip :content="t('taskHistory.delete')">
              <button class="wm-icon-button" type="button" @click="deleteTask(task)">
                <TrashIcon class="wm-icon" />
              </button>
            </WmTooltip>
          </div>
        </article>

        <div v-if="!filteredTasks.length" class="wm-sync-empty">{{ t('taskHistory.empty') }}</div>
      </div>
    </section>
  </div>
</template>
