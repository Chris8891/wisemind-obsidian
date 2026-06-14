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
    LinkIcon,
  } from '@heroicons/vue/24/outline';

  import wiseMindLogoIcon from '../../assets/icons/wisemindai-logo.svg?raw';
  import {usePlugin} from '../../composables/usePlugin';
  import {useVaultNotes} from '../../composables/useVaultNotes';
  import {filterTasksForPath} from '../../services/currentNoteWorkspace';
  import {
    buildTaskHistory,
    type TaskHistoryEntry,
    type TaskHistoryLabels,
    type TaskHistoryType,
    WISEMIND_TASK_HISTORY_UPDATED_EVENT,
  } from '../../services/taskHistory';

  const emit = defineEmits<{
    open: ['summary' | 'cards' | 'chat' | 'sync' | 'search'];
    openChat: [message: string, autoSend?: boolean, newSession?: boolean];
    summarizeCurrent: [];
    searchCurrent: [keyword: string];
    openHistory: [type: TaskHistoryType];
    openTask: [task: TaskHistoryEntry];
    openSettings: [];
  }>();

  const plugin = usePlugin();
  const {t, locale} = useI18n();
  const {notes, refresh: refreshVaultNotes} = useVaultNotes();
  const connected = ref(false);
  const reconnecting = ref(false);
  const historyRevision = ref(0);
  const activeFile = ref(plugin.app.workspace.getActiveFile());
  const chatDraft = ref('');
  const workspaceEventRefs: unknown[] = [];

  const activePath = computed(() => activeFile.value?.path || '');
  const hasActiveMarkdown = computed(() => Boolean(activePath.value));
  const activeTitle = computed(() => activeFile.value?.basename || t('home.noOpenMarkdown'));
  const activeFolder = computed(() =>
    activePath.value.includes('/') ? activePath.value.split('/').slice(0, -1).join('/') : '',
  );
  const activeNote = computed(() => notes.value.find(note => note.path === activePath.value));
  const activeTags = computed(() => activeNote.value?.tags.slice(0, 3) || []);

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

  const recentTasks = computed(
    () => (
      historyRevision.value,
      locale.value,
      buildTaskHistory(plugin.settings, taskHistoryLabels.value)
    ),
  );

  const currentNoteTasks = computed(() =>
    filterTasksForPath(recentTasks.value, activePath.value).slice(0, 3),
  );

  const relatedNotes = computed(() => {
    if (!activePath.value) return [];
    const currentTags = new Set(activeTags.value);
    return notes.value
      .filter(note => note.path !== activePath.value)
      .map(note => {
        const sharedTags = note.tags.filter(tag => currentTags.has(tag));
        const sameFolder = Boolean(activeFolder.value && note.folderPath === activeFolder.value);
        const score = sharedTags.length * 2 + (sameFolder ? 1 : 0);
        return {
          ...note,
          reason: sharedTags.length
            ? t('home.relatedByTag', {tag: sharedTags[0]})
            : sameFolder
              ? t('home.relatedByFolder')
              : '',
          score,
        };
      })
      .filter(note => note.score > 0)
      .sort((a, b) => b.score - a.score || b.modifiedAt - a.modifiedAt)
      .slice(0, 3);
  });

  const noteMeta = computed(() => {
    if (!activePath.value) return t('home.currentNoteEmptyHint');
    const parts = [
      activeNote.value?.plainText ? t('home.wordCount', {count: activeNote.value.plainText.length}) : '',
      t('home.relatedCount', {count: relatedNotes.value.length}),
    ].filter(Boolean);
    return parts.join(' · ');
  });

  const quickActions = computed(() => [
    {
      key: 'summary' as const,
      title: t('home.quickSummary'),
      icon: DocumentTextIcon,
    },
    {
      key: 'cards' as const,
      title: t('home.quickCards'),
      icon: BookmarkSquareIcon,
    },
    {
      key: 'search' as const,
      title: t('home.quickRelated'),
      icon: LinkIcon,
    },
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

  const refreshHistory = () => {
    historyRevision.value += 1;
  };

  const refreshActiveFile = () => {
    activeFile.value = plugin.app.workspace.getActiveFile();
  };

  const reconnect = async () => {
    if (reconnecting.value) return;
    reconnecting.value = true;
    connected.value = await plugin.testConnection();
    reconnecting.value = false;
  };

  const sendChatDraft = () => {
    if (!hasActiveMarkdown.value) return;
    const message = chatDraft.value.trim();
    if (message) {
      emit('openChat', message, true, true);
      chatDraft.value = '';
      return;
    }
    emit('open', 'chat');
  };

  const runQuickAction = (key: 'summary' | 'cards' | 'search') => {
    if (!hasActiveMarkdown.value) return;
    if (key === 'summary') {
      emit('summarizeCurrent');
      return;
    }
    if (key === 'search') {
      emit('searchCurrent', activeTitle.value);
      return;
    }
    emit('open', key);
  };

  onMounted(() => {
    refreshActiveFile();
    void reconnect();
    void refreshVaultNotes();
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
        <span>
          <h2>{{ t('home.title') }}</h2>
          <small>{{ t('home.subtitle') }}</small>
        </span>
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

    <template v-else>
      <section v-if="hasActiveMarkdown" class="wm-home-note-panel">
        <div class="wm-home-note-main">
          <div class="wm-home-note-label">
            <DocumentTextIcon class="wm-icon" />
            <span>{{ t('home.currentNote') }}</span>
          </div>
          <h3 :title="activeTitle">{{ activeTitle }}</h3>
          <p class="wm-home-note-path">{{ activePath || t('home.currentNoteEmptyHint') }}</p>
          <div v-if="activeTags.length" class="wm-home-note-tags">
            <span v-for="tag in activeTags" :key="tag" class="wm-home-tag">#{{ tag }}</span>
          </div>
          <p class="wm-home-note-meta">{{ noteMeta }}</p>
        </div>
      </section>

      <section v-if="!hasActiveMarkdown" class="wm-home-empty-state">
        <DocumentTextIcon class="wm-home-empty-icon" />
        <h3>{{ t('home.noOpenMarkdown') }}</h3>
        <p>{{ t('home.currentNoteEmptyHint') }}</p>
      </section>

      <section v-else class="wm-home-ask-panel">
        <div class="wm-home-section-title">
          <h3>{{ t('home.askCurrentNote') }}</h3>
        </div>
        <div class="wm-home-chat-box">
          <textarea
            v-model="chatDraft"
            class="wm-home-chat-input"
            :placeholder="t('home.askPlaceholder')"
            @keydown.enter.exact.prevent="sendChatDraft"
            @keydown.meta.enter.prevent="sendChatDraft"
            @keydown.ctrl.enter.prevent="sendChatDraft"
          ></textarea>
          <button
            class="wm-home-send-button"
            type="button"
            :aria-label="t('home.sendToChat')"
            @click="sendChatDraft"
          >
            <ChatBubbleOvalLeftEllipsisIcon class="wm-icon" />
          </button>
        </div>
        <div class="wm-home-quick-actions">
          <button
            v-for="action in quickActions"
            :key="action.key"
            class="wm-home-quick-button"
            type="button"
            :disabled="!hasActiveMarkdown"
            @click="runQuickAction(action.key)"
          >
            <component :is="action.icon" class="wm-icon" />
            <span>{{ action.title }}</span>
          </button>
        </div>
      </section>

      <section v-if="hasActiveMarkdown" class="wm-home-section">
        <div class="wm-home-section-title">
          <h3>{{ t('home.relatedNotes') }}</h3>
        </div>
        <div class="wm-home-related-panel">
          <template v-if="relatedNotes.length">
            <button
              v-for="note in relatedNotes"
              :key="note.path"
              class="wm-home-related-item"
              type="button"
              @click="emit('open', 'chat')"
            >
              <DocumentTextIcon class="wm-icon" />
              <span>
                <strong>{{ note.title }}</strong>
                <small>{{ note.reason }}</small>
              </span>
              <ChevronRightIcon class="wm-icon" />
            </button>
          </template>
          <p v-else class="wm-home-empty">{{ t('home.noRelatedNotes') }}</p>
          <button class="wm-home-wide-button" type="button" @click="emit('open', 'search')">
            {{ t('home.viewAllRelated') }}
            <ChevronRightIcon class="wm-icon" />
          </button>
        </div>
      </section>

      <section v-if="currentNoteTasks.length" class="wm-home-section">
        <div class="wm-home-section-title">
          <h3>{{ t('home.currentNoteWorkflow') }}</h3>
          <button class="wm-inline-button" type="button" @click="emit('openHistory', 'all')">
            {{ t('home.viewAll') }}
            <ChevronRightIcon class="wm-icon" />
          </button>
        </div>
        <div class="wm-home-recent-panel">
          <button
            v-for="task in currentNoteTasks"
            :key="`${task.type}:${task.id}`"
            class="wm-home-workflow-item"
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
      </section>

      <footer class="wm-home-sync-footer">
        <span>
          <ArrowPathIcon class="wm-icon" />
          {{ t('home.syncedStatus') }}
        </span>
        <button class="wm-inline-button" type="button" @click="emit('open', 'sync')">
          {{ t('home.syncPreview') }}
        </button>
      </footer>
    </template>
  </section>
</template>
