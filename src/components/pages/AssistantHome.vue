<script setup lang="ts">
  import {computed, onMounted, onUnmounted, ref} from 'vue';
  import {useI18n} from 'vue-i18n';
  import {
    ArrowPathIcon,
    BookmarkSquareIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    ChevronRightIcon,
    Cog6ToothIcon,
    DocumentTextIcon,
    MagnifyingGlassIcon,
    SparklesIcon,
  } from '@heroicons/vue/24/outline';

  import wiseMindLogoIcon from '../../assets/icons/wisemindai-logo.svg?raw';
  import {usePlugin} from '../../composables/usePlugin';
  import {filterTasksForPath} from '../../services/currentNoteWorkspace';
  import {
    buildTaskHistory,
    type TaskHistoryEntry,
    type TaskHistoryType,
    WISEMIND_TASK_HISTORY_UPDATED_EVENT,
  } from '../../services/taskHistory';
  import RekaSelect from '../RekaSelect.vue';

  const emit = defineEmits<{
    open: ['summary' | 'cards' | 'chat' | 'sync' | 'search'];
    openHistory: [type: TaskHistoryType];
    openTask: [task: TaskHistoryEntry];
    openSettings: [];
  }>();

  const plugin = usePlugin();
  const {t, locale} = useI18n();
  const connected = ref(false);
  const reconnecting = ref(false);
  const taskFilter = ref<TaskHistoryType>('all');
  const historyRevision = ref(0);
  const activeFile = ref(plugin.app.workspace.getActiveFile());
  const workspaceEventRefs: unknown[] = [];

  const activePath = computed(() => activeFile.value?.path || '');
  const activeTitle = computed(() => activeFile.value?.basename || t('home.noOpenMarkdown'));

  const currentNoteTasks = computed(() =>
    filterTasksForPath(recentTasks.value, activePath.value).slice(0, 4),
  );

  const actions = computed(() => [
    {
      key: 'summary' as const,
      title: t('home.actions.summarizeTitle'),
      desc: t('home.actions.summarizeDesc'),
      icon: DocumentTextIcon,
    },
    {
      key: 'cards' as const,
      title: t('home.actions.cardsTitle'),
      desc: t('home.actions.cardsDesc'),
      icon: BookmarkSquareIcon,
    },
    {
      key: 'chat' as const,
      title: t('home.actions.chatTitle'),
      desc: t('home.actions.chatDesc'),
      icon: ChatBubbleOvalLeftEllipsisIcon,
    },
    {
      key: 'summary' as const,
      title: t('home.actions.extractTitle'),
      desc: t('home.actions.extractDesc'),
      icon: SparklesIcon,
    },
    {
      key: 'sync' as const,
      title: t('home.actions.syncTitle'),
      desc: t('home.actions.syncDesc'),
      icon: ArrowPathIcon,
    },
  ]);

  const refreshHistory = () => {
    historyRevision.value += 1;
  };

  const refreshActiveFile = () => {
    activeFile.value = plugin.app.workspace.getActiveFile();
  };

  const recentTasks = computed(() => (historyRevision.value, buildTaskHistory(plugin.settings)));

  const filteredTasks = computed(() => {
    if (taskFilter.value === 'all') return recentTasks.value.slice(0, 6);
    return recentTasks.value.filter(item => item.type === taskFilter.value).slice(0, 6);
  });

  const primaryActions = computed(() => [
    {
      key: 'summary' as const,
      title: t('nav.summary'),
      icon: DocumentTextIcon,
      disabled: false,
    },
    {
      key: 'chat' as const,
      title: t('nav.chat'),
      icon: ChatBubbleOvalLeftEllipsisIcon,
      disabled: false,
    },
    {
      key: 'cards' as const,
      title: t('nav.cards'),
      icon: BookmarkSquareIcon,
      disabled: false,
    },
    {
      key: 'sync' as const,
      title: t('nav.sync'),
      icon: ArrowPathIcon,
      disabled: false,
    },
  ]);

  const taskTypeOptions = computed(() => [
    {value: 'all', label: t('home.taskTypes.all')},
    {value: 'summary', label: t('home.taskTypes.summary')},
    {value: 'cards', label: t('home.taskTypes.cards')},
    {value: 'chat', label: t('home.taskTypes.chat')},
    {value: 'sync', label: t('home.taskTypes.sync')},
  ]);

  const taskTypeLabel = (type: TaskHistoryType) => {
    if (type === 'summary') return t('home.taskTypes.summaryTask');
    if (type === 'cards') return t('home.taskTypes.cardsTask');
    if (type === 'chat') return t('home.taskTypes.chatTask');
    if (type === 'sync') return t('home.taskTypes.syncTask');
    return t('home.taskTypes.all');
  };

  const formatTime = (time: number) =>
    new Date(time).toLocaleString(locale.value === 'en_US' ? 'en-US' : 'zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const reconnect = async () => {
    if (reconnecting.value) return;
    reconnecting.value = true;
    connected.value = await plugin.testConnection();
    reconnecting.value = false;
  };

  onMounted(() => {
    refreshActiveFile();
    void reconnect();
    window.addEventListener(WISEMIND_TASK_HISTORY_UPDATED_EVENT, refreshHistory);
    const workspace = plugin.app.workspace as any;
    if (typeof workspace.on === 'function') {
      workspaceEventRefs.push(workspace.on('file-open', refreshActiveFile));
      workspaceEventRefs.push(workspace.on('active-leaf-change', refreshActiveFile));
      workspaceEventRefs.push(workspace.on('layout-change', refreshActiveFile));
    }
  });
  onUnmounted(() => {
    window.removeEventListener(WISEMIND_TASK_HISTORY_UPDATED_EVENT, refreshHistory);
    const workspace = plugin.app.workspace as any;
    if (typeof workspace.offref === 'function') {
      workspaceEventRefs.forEach(eventRef => workspace.offref(eventRef));
    }
    workspaceEventRefs.splice(0);
  });
</script>

<template>
  <section class="wm-page wm-home-page">
    <header class="wm-home-header">
      <div class="wm-home-title">
        <span class="wm-brand-logo" v-html="wiseMindLogoIcon"></span>
        <h2>{{ t('home.title') }}</h2>
      </div>
      <div class="wm-status-actions">
        <span class="wm-status-pill" :class="{'is-connected': connected}">
          {{ connected ? t('home.connected') : t('home.disconnected') }}
        </span>
        <button
          v-if="!connected"
          class="wm-button"
          type="button"
          :disabled="reconnecting"
          @click="reconnect"
        >
          <span v-if="reconnecting" class="wm-loading-spinner"></span>
          <ArrowPathIcon v-else class="wm-icon" />
          {{ reconnecting ? t('home.connecting') : t('home.reconnect') }}
        </button>
      </div>
    </header>

    <section v-if="!connected" class="wm-home-connection-card">
      <span class="wm-welcome-logo" v-html="wiseMindLogoIcon"></span>
      <div class="wm-home-connection-copy">
        <h3>{{ t('home.connectFirst') }}</h3>
        <p>{{ t('home.connectionHint') }}</p>
      </div>
      <div class="wm-home-connection-actions">
        <button class="wm-button" type="button" :disabled="reconnecting" @click="reconnect">
          <span v-if="reconnecting" class="wm-loading-spinner"></span>
          <ArrowPathIcon v-else class="wm-icon" />
          {{ reconnecting ? t('home.connecting') : t('settings.testConnection') }}
        </button>
        <button class="wm-button" type="button" @click="emit('openSettings')">
          <Cog6ToothIcon class="wm-icon" />
          {{ t('home.openSettings') }}
        </button>
      </div>
    </section>

    <section v-else class="wm-home-note-panel">
      <div class="wm-home-note-main">
        <p class="wm-home-eyebrow">{{ t('home.currentNote') }}</p>
        <h3>{{ activeTitle }}</h3>
        <p class="wm-home-note-path">
          {{ activePath || t('home.currentNoteEmptyHint') }}
        </p>
        <div class="wm-home-quick-actions">
          <button
            v-for="action in primaryActions"
            :key="action.key"
            class="wm-home-quick-button"
            type="button"
            @click="emit('open', action.key)"
          >
            <component :is="action.icon" class="wm-icon" />
            <span>{{ action.title }}</span>
          </button>
        </div>
      </div>

      <div class="wm-home-note-history">
        <div class="wm-home-section-title">
          <h4>{{ t('home.currentNoteHistory') }}</h4>
          <button class="wm-inline-button" type="button" @click="emit('openHistory', 'all')">
            {{ t('home.viewAll') }}
            <ChevronRightIcon class="wm-icon" />
          </button>
        </div>
        <div v-if="currentNoteTasks.length" class="wm-home-history-list">
          <button
            v-for="task in currentNoteTasks"
            :key="`${task.type}:${task.id}`"
            class="wm-home-history-item"
            type="button"
            @click="emit('openTask', task)"
          >
            <span>
              <strong>{{ task.title }}</strong>
              <small>{{ taskTypeLabel(task.type) }} · {{ formatTime(task.createdAt) }}</small>
            </span>
            <ChevronRightIcon class="wm-icon" />
          </button>
        </div>
        <p v-else class="wm-home-empty">{{ t('home.noCurrentNoteTasks') }}</p>
      </div>
    </section>

    <section class="wm-home-section">
      <div class="wm-home-section-title">
        <h3>{{ t('home.moreActions') }}</h3>
      </div>
      <div class="wm-home-operation-list">
        <button
          v-for="action in actions"
          :key="`${action.key}:${action.title}`"
          type="button"
          class="wm-home-operation"
          @click="emit('open', action.key)"
        >
          <span class="wm-home-operation-icon">
            <component :is="action.icon" class="wm-icon" />
          </span>
          <span class="wm-home-operation-copy">
            <strong>{{ action.title }}</strong>
            <small>{{ action.desc }}</small>
          </span>
          <ChevronRightIcon class="wm-action-arrow" />
        </button>
      </div>
    </section>

    <button class="wm-home-search-button" type="button" @click="emit('open', 'search')">
      <MagnifyingGlassIcon class="wm-icon" />
      {{ t('home.searchAll') }}
    </button>

    <section class="wm-home-section">
      <div class="wm-home-section-title">
        <h3>{{ t('home.recentTasks') }}</h3>
        <div class="wm-home-filter">
          <RekaSelect v-model="taskFilter" :options="taskTypeOptions" />
          <button class="wm-inline-button" type="button" @click="emit('openHistory', taskFilter)">
            {{ t('home.viewAll') }}
            <ChevronRightIcon class="wm-icon" />
          </button>
        </div>
      </div>
      <div class="wm-home-recent-panel">
        <template v-if="filteredTasks.length">
          <button
            v-for="task in filteredTasks"
            :key="`${task.type}:${task.id}`"
            class="wm-home-recent-item"
            type="button"
            @click="emit('openTask', task)"
          >
            <span>
              <strong>{{ task.title }}</strong>
              <small>{{ taskTypeLabel(task.type) }} · {{ formatTime(task.createdAt) }}</small>
            </span>
            <ChevronRightIcon class="wm-icon" />
          </button>
        </template>
        <p v-else class="wm-home-empty">{{ t('home.noRecentTasks') }}</p>
      </div>
    </section>
  </section>
</template>
