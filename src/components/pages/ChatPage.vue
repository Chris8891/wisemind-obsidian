<script setup lang="ts">
  import {computed, nextTick, onMounted, onUnmounted, ref, watch} from 'vue';
  import {
    ArrowTopRightOnSquareIcon,
    ArrowUpIcon,
    ChatBubbleOvalLeftEllipsisIcon,
    ClipboardDocumentIcon,
    ClockIcon,
    DocumentTextIcon,
    PlusIcon,
    TrashIcon,
    XMarkIcon,
  } from '@heroicons/vue/24/outline';
  import {Notice} from 'obsidian';
  import {TabsContent, TabsList, TabsRoot, TabsTrigger} from 'reka-ui';

  import {usePlugin} from '../../composables/usePlugin';
  import {useVaultNotes} from '../../composables/useVaultNotes';
  import {useWiseMindConnectionGuard} from '../../composables/useWiseMindConnectionGuard';
  import {resolveLanguageSetting} from '../../i18n';
  import {type ChatInsertFormat, formatChatMessageForInsert} from '../../services/chatInsertFormat';
  import {type NoteMentionCandidate, searchNoteMentions} from '../../services/noteMentionSearch';
  import {openObsidianNote} from '../../services/noteNavigation';
  import {insertTextToActiveNote} from '../../services/noteWriter';
  import {
    notifyTaskHistoryUpdated,
    WISEMIND_TASK_HISTORY_UPDATED_EVENT,
  } from '../../services/taskHistory';
  import type {AssistantChatMessage, AssistantChatSession, ObsidianSourceItem} from '../../types';
  import MarkdownView from '../MarkdownView.vue';
  import NoteMentionPicker from '../NoteMentionPicker.vue';
  import NotePickerDialog from '../NotePickerDialog.vue';
  import WiseMindConnectionDialog from '../WiseMindConnectionDialog.vue';
  import WmTooltip from '../WmTooltip.vue';

  type ChatRole = 'user' | 'assistant';
  type ChatMessage = AssistantChatMessage & {role: ChatRole};
  type ChatSession = AssistantChatSession & {
    messages: ChatMessage[];
  };

  const props = defineProps<{
    historyItemId?: string;
    historyToken?: number;
  }>();

  const plugin = usePlugin();
  const {notes, query, refresh} = useVaultNotes();
  const {connectionDialogOpen, ensureWiseMindConnected} = useWiseMindConnectionGuard();
  const sessions = ref<ChatSession[]>([]);
  const activeSessionId = ref('');
  const input = ref('');
  const loading = ref(false);
  const error = ref('');
  const modelLabel = ref('当前模型');
  const mentionOpen = ref(false);
  const mentionActiveIndex = ref(0);
  const abortController = ref<AbortController | null>(null);
  const inputEl = ref<HTMLTextAreaElement | null>(null);
  const historyDialogOpen = ref(false);
  const notePickerOpen = ref(false);
  const selectedNotesOpen = ref(false);
  const historyRevision = ref(0);
  const insertFormat = ref<ChatInsertFormat>('markdown');

  const activeSession = computed(
    () => sessions.value.find(item => item.id === activeSessionId.value) || sessions.value[0],
  );
  const canSend = computed(() => Boolean(input.value.trim()) && !loading.value);
  const savedChatSessions = computed(() => {
    void historyRevision.value;
    return [...(plugin.settings.assistantChatSessions || [])].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  });
  const savedChatSessionCount = computed(() => savedChatSessions.value.length);
  const mentionCandidates = computed(() => {
    const limit = Math.max(0, Math.floor(Number(plugin.settings.mentionNoteLimit || 0)));
    return searchNoteMentions(notes.value, query.value, limit);
  });
  const activeContextPaths = computed(() => {
    const session = activeSession.value;
    if (!session) return [];
    const paths = Array.isArray(session.contextPaths) ? session.contextPaths : [];
    const all = [session.contextPath, ...paths].filter(Boolean);
    return Array.from(new Set(all));
  });
  const selectedContextNotes = computed(() =>
    notes.value.filter(note => activeContextPaths.value.includes(note.path)),
  );

  const loadSessionsFromSettings = () => {
    sessions.value = sessions.value.map(session => {
      const saved = plugin.settings.assistantChatSessions.find(item => item.id === session.id);
      return saved ? {...saved, messages: [...(saved.messages || [])]} : session;
    });
    if (!sessions.value.length) {
      createSession(false);
    }
    if (!sessions.value.some(session => session.id === activeSessionId.value)) {
      activeSessionId.value = sessions.value[0]?.id || '';
    }
    historyRevision.value += 1;
  };

  const findActiveMention = (text: string, cursor: number) => {
    const before = text.slice(0, cursor);
    const lineStart = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r')) + 1;
    const lineBeforeCursor = before.slice(lineStart);
    const atIndex = lineBeforeCursor.lastIndexOf('@');
    if (atIndex === -1) return null;
    if (atIndex > 0 && !/\s/.test(lineBeforeCursor[atIndex - 1])) return null;
    return {
      start: lineStart + atIndex,
      query: lineBeforeCursor.slice(atIndex + 1),
    };
  };

  const persistSessions = async () => {
    const savedById = new Map(
      plugin.settings.assistantChatSessions.map(session => [session.id, session]),
    );
    sessions.value.forEach(session => {
      savedById.set(session.id, {
        ...session,
        messages: [...session.messages],
      });
    });
    plugin.settings.assistantChatSessions = [...savedById.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);
    await plugin.saveSettings();
    historyRevision.value += 1;
    notifyTaskHistoryUpdated();
  };

  const createSession = (persist = true) => {
    const file = plugin.app.workspace.getActiveFile();
    const session: ChatSession = {
      id: `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: file?.basename || `新会话 ${sessions.value.length + 1}`,
      contextPath: file?.path || '',
      contextPaths: file?.path ? [file.path] : [],
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    sessions.value.push(session);
    activeSessionId.value = session.id;
    input.value = '';
    if (persist) void persistSessions();
  };

  const closeSession = (id: string) => {
    sessions.value = sessions.value.filter(item => item.id !== id);
    if (!sessions.value.length) createSession(false);
    if (activeSessionId.value === id) activeSessionId.value = sessions.value[0].id;
  };

  const clearAll = () => {
    sessions.value = [];
    createSession(false);
  };

  const clearActiveSession = () => {
    const session = activeSession.value;
    if (!session) return;
    session.messages = [];
    session.updatedAt = Date.now();
    input.value = '';
    void persistSessions();
  };

  const setActiveContextPath = (path: string) => {
    const session = activeSession.value;
    if (!session) return;
    session.contextPath = path;
    session.contextPaths = path ? [path] : [];
    session.updatedAt = Date.now();
    void persistSessions();
  };

  const setActiveContextNotes = (items: ObsidianSourceItem[]) => {
    const session = activeSession.value;
    if (!session) return;
    const paths = items.map(item => item.path);
    session.contextPaths = paths;
    session.contextPath = paths[0] || '';
    session.updatedAt = Date.now();
    notePickerOpen.value = false;
    selectedNotesOpen.value = false;
    void persistSessions();
  };

  const removeActiveContextPath = (path: string) => {
    const session = activeSession.value;
    if (!session) return;
    const paths = activeContextPaths.value.filter(item => item !== path);
    session.contextPaths = paths;
    session.contextPath = paths[0] || '';
    if (paths.length <= 1) selectedNotesOpen.value = false;
    session.updatedAt = Date.now();
    void persistSessions();
  };

  const openContextNote = (path: string) => {
    void openObsidianNote(plugin.app, path);
  };

  const openHistoryItem = async (id?: string) => {
    if (!id) return;
    const session = sessions.value.find(item => item.id === id);
    if (session) {
      activeSessionId.value = session.id;
      historyDialogOpen.value = false;
      if (session.contextPath) await openObsidianNote(plugin.app, session.contextPath);
      return;
    }
    const saved = plugin.settings.assistantChatSessions.find(item => item.id === id);
    if (!saved) return;
    sessions.value.unshift({
      ...saved,
      messages: [...(saved.messages || [])],
    });
    activeSessionId.value = saved.id;
    historyDialogOpen.value = false;
    if (saved.contextPath) await openObsidianNote(plugin.app, saved.contextPath);
  };

  const deleteHistoryItem = async (session: AssistantChatSession) => {
    const title = session.title || 'AI 对话';
    if (!window.confirm(`确定删除「${title}」这条历史对话吗？`)) return;

    plugin.settings.assistantChatSessions = plugin.settings.assistantChatSessions.filter(
      item => item.id !== session.id,
    );
    sessions.value = sessions.value.filter(item => item.id !== session.id);
    if (!sessions.value.length) {
      createSession(false);
    } else if (activeSessionId.value === session.id) {
      activeSessionId.value = sessions.value[0].id;
    }

    await plugin.saveSettings();
    historyRevision.value += 1;
    notifyTaskHistoryUpdated();
    new Notice('历史对话已删除');
  };

  const formatHistoryTime = (time: number) =>
    new Date(time).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const extractMentionedPaths = (message: string) => {
    const sorted = [...notes.value].sort((a, b) => b.path.length - a.path.length);
    return sorted.filter(note => message.includes(`@${note.path}`)).map(note => note.path);
  };

  const buildReference = async (path: string) => {
    if (!path) return null;
    const note = notes.value.find(item => item.path === path);
    if (!note) return null;
    return {title: note.title, path: note.path, content: note.markdown || note.plainText};
  };

  const send = async () => {
    const session = activeSession.value;
    const message = input.value.trim();
    if (!session || !message || loading.value) return;
    if (!(await ensureWiseMindConnected())) return;
    abortController.value?.abort();
    abortController.value = new AbortController();
    loading.value = true;
    error.value = '';
    session.messages.push({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      createdAt: Date.now(),
    });
    session.title = session.messages.length === 1 ? message.slice(0, 18) : session.title;
    session.updatedAt = Date.now();
    input.value = '';

    try {
      const contextPaths = activeContextPaths.value;
      const currentNote = await buildReference(contextPaths[0] || '');
      const referencePaths = Array.from(
        new Set([...contextPaths.slice(1), ...extractMentionedPaths(message)]),
      ).filter(path => path !== currentNote?.path);
      const references = (await Promise.all(referencePaths.map(buildReference))).filter(Boolean);
      const result: any = await plugin.api.chat(
        {
          message,
          language: resolveLanguageSetting(plugin.settings.assistantDefaults.language),
          currentNote,
          references,
          history: session.messages
            .slice(0, -1)
            .slice(-12)
            .map(item => ({role: item.role, content: item.content})),
        },
        {signal: abortController.value.signal},
      );
      session.messages.push({
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: result.message || '',
        createdAt: Date.now(),
      });
      if (result.model) modelLabel.value = result.model;
    } catch (err: any) {
      if (!abortController.value?.signal.aborted) error.value = err?.message || '对话失败';
    } finally {
      session.updatedAt = Date.now();
      void persistSessions();
      loading.value = false;
      abortController.value = null;
    }
  };

  const stop = () => {
    abortController.value?.abort();
    abortController.value = null;
    loading.value = false;
  };

  const copyMessage = async (content: string) => {
    await globalThis.navigator?.clipboard?.writeText(content);
    new Notice('消息已复制');
  };

  const insertMessage = async (content: string) => {
    await insertTextToActiveNote(
      plugin,
      formatChatMessageForInsert(content, insertFormat.value),
      '消息已插入当前打开笔记',
    );
  };

  const onInput = () => {
    const cursor = inputEl.value?.selectionStart ?? input.value.length;
    const mention = findActiveMention(input.value, cursor);
    mentionOpen.value = Boolean(mention);
    query.value = mention?.query || '';
    mentionActiveIndex.value = 0;
  };

  const pickMentionCandidate = async (candidate: NoteMentionCandidate) => {
    const textarea = inputEl.value;
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? input.value.length;
    const after = input.value.slice(cursor);
    const mention = findActiveMention(input.value, cursor);
    const start = mention?.start ?? cursor;
    input.value = `${input.value.slice(0, start)}${candidate.insertText}${after}`;
    mentionOpen.value = false;
    await nextTick();
    textarea.focus();
  };

  const onComposerKeydown = (event: KeyboardEvent) => {
    if (mentionOpen.value) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        mentionActiveIndex.value = Math.min(
          mentionActiveIndex.value + 1,
          Math.max(mentionCandidates.value.length - 1, 0),
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        mentionActiveIndex.value = Math.max(mentionActiveIndex.value - 1, 0);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        mentionOpen.value = false;
        return;
      }
      if (event.key === 'Enter') {
        const candidate = mentionCandidates.value[mentionActiveIndex.value];
        if (candidate) {
          event.preventDefault();
          void pickMentionCandidate(candidate);
          return;
        }
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  onMounted(async () => {
    await refresh();
    loadSessionsFromSettings();
    void openHistoryItem(props.historyItemId);
    window.addEventListener(WISEMIND_TASK_HISTORY_UPDATED_EVENT, loadSessionsFromSettings);
    window.addEventListener('wisemindai:chat-draft', onChatDraft as EventListener);
    try {
      const result = await plugin.api.getAssistantModel();
      modelLabel.value = result.model || modelLabel.value;
    } catch {
      modelLabel.value = '未配置模型';
    }
  });

  onUnmounted(() => {
    window.removeEventListener(WISEMIND_TASK_HISTORY_UPDATED_EVENT, loadSessionsFromSettings);
    window.removeEventListener('wisemindai:chat-draft', onChatDraft as EventListener);
  });

  const onChatDraft = (event: CustomEvent<{message?: string}>) => {
    const message = event.detail?.message || '';
    if (message) input.value = message;
  };

  watch(
    () => props.historyToken,
    () => void openHistoryItem(props.historyItemId),
    {immediate: true},
  );
</script>

<template>
  <section class="wm-page wm-chat-page">
    <header class="wm-page-header">
      <div class="wm-title-line">
        <ChatBubbleOvalLeftEllipsisIcon class="wm-title-icon" />
        <h2>AI 对话</h2>
      </div>
      <div class="wm-toolbar">
        <WmTooltip content="历史对话">
          <button class="wm-icon-button" type="button" @click="historyDialogOpen = true">
            <ClockIcon class="wm-icon" />
          </button>
        </WmTooltip>
        <WmTooltip content="创建新会话">
          <button class="wm-icon-button" type="button" @click="createSession()">
            <PlusIcon class="wm-icon" />
          </button>
        </WmTooltip>
        <WmTooltip content="关闭全部">
          <button class="wm-icon-button" type="button" @click="clearAll">
            <TrashIcon class="wm-icon" />
          </button>
        </WmTooltip>
      </div>
    </header>

    <TabsRoot v-if="activeSession" v-model="activeSessionId" class="wm-chat-tabs">
      <TabsList class="wm-chat-tab-list" aria-label="AI 对话会话">
        <TabsTrigger
          v-for="session in sessions"
          :key="session.id"
          class="wm-chat-tab"
          :value="session.id"
        >
          <span>{{ session.title }}</span>
          <WmTooltip content="关闭">
            <button class="wm-tab-close" type="button" @click.stop="closeSession(session.id)">
              <XMarkIcon class="wm-icon" />
            </button>
          </WmTooltip>
        </TabsTrigger>
      </TabsList>

      <TabsContent :value="activeSession.id" class="wm-chat-content">
        <div class="wm-chat-messages">
          <div v-if="!activeSession.messages.length && !loading" class="wm-chat-empty">
            <ChatBubbleOvalLeftEllipsisIcon class="wm-empty-icon" />
            <h3>Hi，你想了解什么？</h3>
            <button class="wm-pill-button" type="button" @click="input = '这篇笔记讲了什么？'"
              >问点什么？</button
            >
            <div class="wm-empty-prompts">
              <button class="wm-pill-button" type="button" @click="input = '总结这篇笔记'"
                >总结文档</button
              >
              <button class="wm-pill-button" type="button" @click="input = '提炼这篇笔记的关键观点'"
                >提取观点</button
              >
              <button
                class="wm-pill-button"
                type="button"
                @click="input = '基于这篇笔记提出 5 个值得继续思考的问题'"
                >提出相关问题</button
              >
            </div>
          </div>

          <div
            v-for="message in activeSession.messages"
            :key="message.id"
            class="wm-message-row"
            :class="`is-${message.role}`"
          >
            <article class="wm-message" :class="`is-${message.role}`">
              <MarkdownView
                v-if="message.role === 'assistant'"
                :markdown="message.content"
                :source-path="activeSession.contextPath"
              />
              <div v-else class="wm-message-plain">{{ message.content }}</div>
            </article>
            <footer class="wm-message-tools">
              <span>{{
                new Date(message.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              }}</span>
              <div>
                <WmTooltip content="复制">
                  <button
                    class="wm-icon-button"
                    type="button"
                    @click="copyMessage(message.content)"
                  >
                    <ClipboardDocumentIcon class="wm-icon" />
                  </button>
                </WmTooltip>
                <WmTooltip content="插入笔记">
                  <button
                    class="wm-icon-button"
                    type="button"
                    @click="insertMessage(message.content)"
                  >
                    <DocumentTextIcon class="wm-icon" />
                  </button>
                </WmTooltip>
              </div>
            </footer>
          </div>

          <article v-if="loading" class="wm-message is-assistant">
            <div class="wm-message-plain">正在思考...</div>
          </article>
        </div>

        <div v-if="error" class="wm-alert is-error">{{ error }}</div>

        <div class="wm-chat-composer">
          <div class="wm-composer-top">
            <WmTooltip
              v-if="activeContextPaths.length > 1"
              :content="activeContextPaths.join('\\n')"
            >
              <button
                class="wm-context-chip"
                type="button"
                @click="selectedNotesOpen = !selectedNotesOpen"
              >
                <DocumentTextIcon class="wm-icon" />
                <span class="wm-context-label wm:text-xs">
                  已选择 {{ activeContextPaths.length }} 篇笔记
                </span>
              </button>
            </WmTooltip>
            <WmTooltip v-else :content="activeContextPaths[0] || '当前没有选择笔记'">
              <span class="wm-context-chip">
                <DocumentTextIcon class="wm-icon" />
                <span class="wm-context-label wm:text-xs">{{
                  activeContextPaths.length
                    ? activeContextPaths.length === 1
                      ? activeContextPaths[0]
                      : `已选择 ${activeContextPaths.length} 篇笔记`
                    : '当前没有选择笔记'
                }}</span>
                <WmTooltip v-if="activeContextPaths.length === 1" content="打开笔记">
                  <button
                    class="wm-chip-button"
                    type="button"
                    @click="openContextNote(activeContextPaths[0])"
                  >
                    <ArrowTopRightOnSquareIcon class="wm-icon" />
                  </button>
                </WmTooltip>
                <WmTooltip v-if="activeContextPaths.length" content="清除已选笔记">
                  <button class="wm-chip-button" type="button" @click="setActiveContextPath('')">
                    <XMarkIcon class="wm-icon" />
                  </button>
                </WmTooltip>
                <WmTooltip v-else content="使用当前打开笔记">
                  <button
                    class="wm-chip-button"
                    type="button"
                    @click="setActiveContextPath(plugin.app.workspace.getActiveFile()?.path || '')"
                  >
                    <PlusIcon class="wm-icon" />
                  </button>
                </WmTooltip>
              </span>
            </WmTooltip>
            <button class="wm-button" type="button" @click="notePickerOpen = true">
              <DocumentTextIcon class="wm-icon" />
              选择笔记
            </button>
            <button class="wm-button" type="button" @click="clearActiveSession">清空</button>
          </div>

          <div
            v-if="selectedNotesOpen && activeContextPaths.length > 1"
            class="wm-selected-context-popover wm-mention-menu"
          >
            <div
              v-for="note in selectedContextNotes"
              :key="note.path"
              class="wm-selected-context-option"
            >
              <button
                class="wm-selected-context-main"
                type="button"
                @click="openContextNote(note.path)"
              >
                <span class="wm-mention-title">{{ note.title }}</span>
                <span class="wm-mention-path">{{ note.folderPath || '根目录' }}</span>
              </button>
              <button
                class="wm-chip-button"
                type="button"
                aria-label="移除笔记"
                @click="removeActiveContextPath(note.path)"
              >
                <XMarkIcon class="wm-icon" />
              </button>
            </div>
          </div>

          <div class="wm-chat-input-wrap">
            <textarea
              ref="inputEl"
              v-model="input"
              class="wm-chat-input"
              placeholder="输入问题，即可与当前文档进行对话，输入 @ 引用文档。"
              @input="onInput"
              @keydown="onComposerKeydown"
            ></textarea>
            <NoteMentionPicker
              v-if="mentionOpen"
              :candidates="mentionCandidates"
              :active-index="mentionActiveIndex"
              @pick="pickMentionCandidate"
            />
            <button
              v-if="loading"
              class="wm-composer-send-button"
              type="button"
              aria-label="停止"
              @click="stop"
            >
              <XMarkIcon class="wm-icon" />
            </button>
            <button
              v-else
              class="wm-composer-send-button"
              type="button"
              aria-label="发送"
              :disabled="!canSend"
              @click="send"
            >
              <ArrowUpIcon class="wm-icon" />
            </button>
          </div>
        </div>
      </TabsContent>
    </TabsRoot>
    <NotePickerDialog
      v-model:open="notePickerOpen"
      :selected-paths="activeContextPaths"
      @confirm="setActiveContextNotes"
    />
    <WiseMindConnectionDialog v-model:open="connectionDialogOpen" />

    <Teleport to="#wisemindai-obsidian-root">
      <div
        v-if="historyDialogOpen"
        class="wm-modal-overlay"
        @click.self="historyDialogOpen = false"
      >
        <section
          class="wm-modal-box wm-chat-history-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="历史对话"
        >
          <header class="wm-history-dialog-header">
            <h3 class="wm-dialog-title">历史对话（{{ savedChatSessionCount }}）</h3>
            <button
              class="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
              type="button"
              @click="historyDialogOpen = false"
              >✕</button
            >
          </header>

          <div class="wm-chat-history-list">
            <div
              v-for="session in savedChatSessions"
              :key="session.id"
              class="wm-chat-history-item"
              role="button"
              tabindex="0"
              @click="openHistoryItem(session.id)"
              @keydown.enter.prevent="openHistoryItem(session.id)"
              @keydown.space.prevent="openHistoryItem(session.id)"
            >
              <span class="wm-chat-history-title-main">
                <ChatBubbleOvalLeftEllipsisIcon class="wm-icon" />
                <strong>{{ session.title || 'AI 对话' }}</strong>
              </span>
              <div class="wm-chat-history-meta">
                <small>{{ formatHistoryTime(session.updatedAt || session.createdAt) }}</small>
                <WmTooltip content="删除">
                  <button
                    class="wm-icon-button"
                    type="button"
                    @click.stop="deleteHistoryItem(session)"
                  >
                    <TrashIcon class="wm-icon" />
                  </button>
                </WmTooltip>
              </div>
            </div>
            <div v-if="!savedChatSessions.length" class="wm-sync-empty"> 还没有历史对话。 </div>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>
