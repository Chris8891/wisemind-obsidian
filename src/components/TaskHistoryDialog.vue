<script setup lang="ts">
  import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowsRightLeftIcon,
    BookmarkSquareIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    ChevronDoubleDownIcon,
    ChevronDoubleUpIcon,
    ChevronRightIcon,
    ClockIcon,
    DocumentTextIcon,
    ListBulletIcon,
    MagnifyingGlassIcon,
    RectangleStackIcon,
    Squares2X2Icon,
    TrashIcon,
    XMarkIcon,
  } from '@heroicons/vue/24/outline';
  import {Notice} from 'obsidian';

  import {rememberFocus, trapTabKey} from '../composables/dialogFocus';
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
  // Matching scans every card and chat message, so it trails typing slightly; clearing applies at once.
  const searchQuery = ref('');
  let searchTimer = 0;
  watch(search, value => {
    window.clearTimeout(searchTimer);
    if (!value.trim()) searchQuery.value = value;
    else searchTimer = window.setTimeout(() => (searchQuery.value = value), 150);
  });
  const selectedType = ref<TaskHistoryType>(props.defaultType);
  const revision = ref(0);
  const expandedIds = ref(new Set<string>());
  const overlayPointerDownOnBackdrop = ref(false);
  const searchInput = ref<HTMLInputElement | null>(null);
  const popEl = ref<HTMLElement | null>(null);
  const pendingDeleteKey = ref('');
  // Marks the row being deleted so only it (not rows hidden by filtering) plays the leave animation.
  const removingKey = ref('');
  let pendingDeleteTimer = 0;
  let restoreFocus: (() => void) | null = null;

  watch(
    () => props.open,
    open => {
      if (open) {
        restoreFocus = rememberFocus();
        return;
      }
      window.clearTimeout(pendingDeleteTimer);
      pendingDeleteKey.value = '';
      restoreFocus?.();
      restoreFocus = null;
    },
  );

  watch(
    () => [props.open, props.defaultType] as const,
    ([open, type]) => {
      if (open) {
        selectedType.value = type;
        search.value = '';
        expandedIds.value = new Set();
        revision.value += 1;
        void nextTick(() => searchInput.value?.focus());
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

  const taskTypeOptions = computed<Array<{value: TaskHistoryType; label: string; icon: unknown}>>(() => [
    {value: 'all', label: t('taskHistoryService.all'), icon: Squares2X2Icon},
    {value: 'chat', label: t('taskHistoryService.chat'), icon: ChatBubbleOvalLeftEllipsisIcon},
    {value: 'summary', label: t('taskHistoryService.summary'), icon: DocumentTextIcon},
    {value: 'cards', label: t('taskHistoryService.cards'), icon: RectangleStackIcon},
    {value: 'sync', label: t('taskHistoryService.sync'), icon: ArrowsRightLeftIcon},
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
        matchesTaskSearch(task, searchQuery.value),
    ),
  );
  const allVisibleExpanded = computed(
    () =>
      filteredTasks.value.length > 0 &&
      filteredTasks.value.every(task => expandedIds.value.has(taskKey(task))),
  );

  const dateLocale = computed(() => (locale.value === 'en_US' ? 'en-US' : 'zh-CN'));

  const formatTime = (time: number) =>
    new Date(time).toLocaleString(dateLocale.value, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const formatShortTime = (time: number) => {
    const date = new Date(time);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString(dateLocale.value, {hour: '2-digit', minute: '2-digit'});
    }
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString(dateLocale.value, {month: 'numeric', day: 'numeric'});
    }
    return date.toLocaleDateString(dateLocale.value, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  };

  const taskIcon = (type: TaskHistoryEntry['type']) => {
    if (type === 'cards') return BookmarkSquareIcon;
    if (type === 'chat') return ChatBubbleOvalLeftEllipsisIcon;
    if (type === 'sync') return ArrowsRightLeftIcon;
    return ListBulletIcon;
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
      const messages = (task.raw as any).messages || [];
      if (!messages.length) return t('taskHistory.emptyChat');
      return messages
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

  const clearFilters = () => {
    search.value = '';
    selectedType.value = 'all';
    searchInput.value?.focus();
  };

  // Two-step delete: the first click arms the button (red, new tooltip), a second click within 3s deletes.
  const requestDelete = (task: TaskHistoryEntry) => {
    const key = taskKey(task);
    window.clearTimeout(pendingDeleteTimer);
    if (pendingDeleteKey.value !== key) {
      pendingDeleteKey.value = key;
      pendingDeleteTimer = window.setTimeout(() => (pendingDeleteKey.value = ''), 3000);
      return;
    }
    pendingDeleteKey.value = '';
    removingKey.value = key;
    void nextTick(() => deleteTask(task));
  };

  const deleteTask = async (task: TaskHistoryEntry) => {
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
    notifyTaskHistoryUpdated();
    try {
      await plugin.saveSettings();
      new Notice(t('taskHistory.deleted'));
    } catch {
      new Notice(t('taskHistory.deleteFailed'));
    }
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

  // Escape clears the search first, then closes.
  const onKeydown = (event: KeyboardEvent) => {
    if (!props.open || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (search.value) {
      search.value = '';
      searchInput.value?.focus();
      return;
    }
    emit('close');
  };

  // Up/Down walks between the search box and the rows; Right/Left expands or collapses the focused row.
  const onPopKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      trapTabKey(event, popEl.value);
      return;
    }
    const target = event.target as HTMLElement | null;
    const rows = Array.from(popEl.value?.querySelectorAll<HTMLElement>('.wm2-history-main') || []);
    const index = target ? rows.indexOf(target) : -1;
    if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && index !== -1) {
      const task = filteredTasks.value[index];
      if (!task || expandedIds.value.has(taskKey(task)) === (event.key === 'ArrowRight')) return;
      event.preventDefault();
      toggleTask(task);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (!rows.length || (index === -1 && target !== searchInput.value)) return;
    if (event.isComposing) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = index === -1 ? (step > 0 ? 0 : rows.length - 1) : index + step;
    if (next < 0) searchInput.value?.focus();
    else rows[Math.min(next, rows.length - 1)].focus();
  };

  // Capture phase: Obsidian handles Escape on the document before a bubbling window listener runs.
  onMounted(() => {
    window.addEventListener(WISEMIND_TASK_HISTORY_UPDATED_EVENT, refreshHistory);
    window.addEventListener('keydown', onKeydown, true);
  });

  onUnmounted(() => {
    window.clearTimeout(searchTimer);
    window.clearTimeout(pendingDeleteTimer);
    window.removeEventListener(WISEMIND_TASK_HISTORY_UPDATED_EVENT, refreshHistory);
    window.removeEventListener('keydown', onKeydown, true);
  });
</script>

<template>
  <Transition name="wm2-history-fade">
    <div
      v-if="open"
      class="wm2-history-layer"
      @pointerdown="onOverlayPointerDown"
      @click="onOverlayClick"
    >
      <section
        ref="popEl"
        class="wm2-history-pop"
        role="dialog"
        aria-modal="true"
        :aria-label="t('taskHistory.ariaLabel')"
        @keydown="onPopKeydown"
      >
        <div class="wm2-history-top">
          <label class="wm2-search-field is-sm">
            <MagnifyingGlassIcon class="wm-icon" />
            <input
              ref="searchInput"
              v-model="search"
              type="text"
              :placeholder="t('taskHistory.searchPlaceholder')"
              :aria-label="t('taskHistory.searchPlaceholder')"
            />
          </label>
          <WmTooltip
            :content="allVisibleExpanded ? t('taskHistory.collapseAll') : t('taskHistory.expandAll')"
          >
            <button
              class="wm2-icon-btn is-sm"
              type="button"
              :disabled="!filteredTasks.length"
              @click="toggleAll"
            >
              <span class="wm-visually-hidden">{{
                allVisibleExpanded ? t('taskHistory.collapseAll') : t('taskHistory.expandAll')
              }}</span>
              <component
                :is="allVisibleExpanded ? ChevronDoubleUpIcon : ChevronDoubleDownIcon"
                class="wm-icon"
              />
            </button>
          </WmTooltip>
          <WmTooltip :content="t('dialog.close')">
            <button class="wm2-icon-btn is-sm" type="button" @click="emit('close')">
              <span class="wm-visually-hidden">{{ t('dialog.close') }}</span>
              <XMarkIcon class="wm-icon" />
            </button>
          </WmTooltip>
        </div>

        <div class="wm2-history-filters" role="tablist" :aria-label="t('taskHistory.title')">
          <button
            v-for="option in taskTypeOptions"
            :key="option.value"
            class="wm2-chip"
            :class="{'is-selected': selectedType === option.value}"
            type="button"
            role="tab"
            :aria-selected="selectedType === option.value"
            @click="selectedType = option.value"
          >
            <component :is="option.icon" class="wm-icon" />
            {{ option.label }}
          </button>
        </div>

        <TransitionGroup v-if="filteredTasks.length" tag="ul" name="wm2-history-row" class="wm2-history-list">
          <li
            v-for="task in filteredTasks"
            :key="taskKey(task)"
            class="wm2-history-item"
            :class="{
              'is-expanded': expandedIds.has(taskKey(task)),
              'is-confirming': pendingDeleteKey === taskKey(task),
              'is-removing': removingKey === taskKey(task),
            }"
          >
            <button
              class="wm2-btn is-ghost is-sm wm2-history-main"
              :class="{'is-active': expandedIds.has(taskKey(task))}"
              type="button"
              :aria-label="`${t('taskHistory.open')} ${task.title}`"
              @click="emit('select', task)"
            >
              <component :is="taskIcon(task.type)" class="wm-icon" />
              <span class="wm2-history-title wm2-truncate">{{ task.title }}</span>
              <span class="wm2-history-time wm2-tabular">{{ formatShortTime(task.createdAt) }}</span>
            </button>
            <div class="wm2-history-actions">
              <WmTooltip
                :content="
                  expandedIds.has(taskKey(task)) ? t('taskHistory.collapse') : t('taskHistory.expand')
                "
              >
                <button
                  class="wm2-icon-btn is-sm"
                  type="button"
                  :aria-expanded="expandedIds.has(taskKey(task))"
                  @click="toggleTask(task)"
                >
                  <span class="wm-visually-hidden">{{
                    expandedIds.has(taskKey(task)) ? t('taskHistory.collapse') : t('taskHistory.expand')
                  }}</span>
                  <ChevronRightIcon
                    class="wm-icon"
                    :class="{'is-expanded': expandedIds.has(taskKey(task))}"
                  />
                </button>
              </WmTooltip>
              <WmTooltip
                :content="
                  pendingDeleteKey === taskKey(task)
                    ? t('taskHistory.deleteConfirmHint')
                    : t('taskHistory.delete')
                "
              >
                <button
                  class="wm2-icon-btn is-sm is-danger"
                  :class="{'is-confirming': pendingDeleteKey === taskKey(task)}"
                  type="button"
                  @click="requestDelete(task)"
                >
                  <span class="wm-visually-hidden">{{
                    pendingDeleteKey === taskKey(task)
                      ? t('taskHistory.deleteConfirmHint')
                      : t('taskHistory.delete')
                  }}</span>
                  <TrashIcon class="wm-icon" />
                </button>
              </WmTooltip>
            </div>

            <div v-if="expandedIds.has(taskKey(task))" class="wm2-history-detail">
              <div class="wm2-history-meta">
                <ClockIcon class="wm-icon" />
                <span class="wm2-truncate">{{ taskMeta(task) }}</span>
              </div>
              <div class="wm2-history-meta">
                <DocumentTextIcon class="wm-icon" />
                <span class="wm2-truncate">{{ taskSource(task) }}</span>
              </div>
              <template v-if="task.type === 'sync'">
                <div
                  v-for="(item, index) in syncTaskRows(task)"
                  :key="`${item.title}:${index}`"
                  class="wm2-history-sync-row"
                >
                  <strong class="wm2-truncate">{{ item.title }}</strong>
                  <ChevronRightIcon class="wm-icon" />
                  <span class="wm2-truncate">{{ item.target }}</span>
                </div>
              </template>
              <pre v-else-if="taskExpandedContent(task)" class="wm2-history-content">{{
                taskExpandedContent(task)
              }}</pre>
            </div>
          </li>
        </TransitionGroup>

        <div v-else class="wm2-empty is-compact wm2-history-empty">
          <ClockIcon class="wm2-empty-icon" />
          <template v-if="!tasks.length">
            <strong>{{ t('taskHistory.emptyAll') }}</strong>
            <p class="wm2-muted">{{ t('taskHistory.emptyAllHint') }}</p>
          </template>
          <template v-else>
            <p>{{ searchQuery.trim() ? t('shared.noMatches') : t('taskHistory.empty') }}</p>
            <button class="wm2-btn is-ghost is-xs" type="button" @click="clearFilters">
              <XMarkIcon class="wm-icon" />
              {{ t('taskHistory.clearFilters') }}
            </button>
          </template>
        </div>
      </section>
    </div>
  </Transition>
</template>
